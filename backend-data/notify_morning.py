"""Tarea 6.14 — Envía el aviso matinal sin spoilers (web push y Android) a quien le toca ahora.

Lo lanza Supabase cada hora de 6 a 10 UTC (pg_cron -> morning_push.yml, backend-data/cron.sql); el
script mira la hora de España y solo envía de 8:00 a 11:00. Cada suscripción recibe el aviso una vez
por jornada (`push_subscriptions.last_sent_day`), a su hora o, si "con notas" no estaba listo, en la
siguiente pasada. El texto sale de processors/morning_digest.py (nunca resultados).

El registro de GitHub es público: solo se imprimen totales, nunca textos, notas ni suscripciones.

Uso (desde backend-data/):
    python notify_morning.py              # envía a quien le toca ahora
    python notify_morning.py --dry-run    # cuenta a quién enviaría, sin enviar
    python notify_morning.py --hour 8     # como si fueran las 8:00 en España (pruebas)
    python notify_morning.py --test       # aviso de prueba a todas las suscripciones (sin datos de partidos)
"""
import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone

import db
from processors import morning_digest as M

VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT") or "https://hoopmeter.com"
FCM_SERVICE_ACCOUNT = os.getenv("FCM_SERVICE_ACCOUNT", "")
TTL_SECONDS = 4 * 3600  # un aviso de la mañana que llega por la tarde ya no sirve
# Solo servicios de push de navegadores conocidos (igual que push_subscribe en push.sql)
WEB_PUSH_HOSTS = re.compile(
    r"^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com"
    r"|[a-z0-9.-]+\.notify\.windows\.com|[a-z0-9.-]+\.push\.apple\.com)/"
)
UPDATE_CHUNK = 20  # los ids son URLs largas: pocas por petición


class Gone(Exception):
    """La suscripción ya no existe (el usuario desinstaló, revocó el permiso...): se borra."""


def send_web(sub: dict, payload: dict) -> None:
    from pywebpush import WebPushException, webpush

    if not WEB_PUSH_HOSTS.match(sub["id"]):
        raise Gone()
    try:
        webpush(
            subscription_info={"endpoint": sub["id"], "keys": sub["keys"]},
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=VAPID_PRIVATE_KEY,
            # pywebpush escribe "aud" en este dict: uno nuevo por envío (cada servicio tiene el suyo)
            vapid_claims={"sub": VAPID_SUBJECT},
            ttl=TTL_SECONDS,
            headers={"Urgency": "normal"},
            timeout=15,
        )
    except WebPushException as error:
        if error.response is not None and error.response.status_code in (404, 410):
            raise Gone() from error
        raise


class Fcm:
    """FCM HTTP v1 con la cuenta de servicio de Firebase (secreto FCM_SERVICE_ACCOUNT)."""

    def __init__(self, info: dict):
        from google.auth.transport.requests import AuthorizedSession
        from google.oauth2 import service_account

        creds = service_account.Credentials.from_service_account_info(
            info, scopes=["https://www.googleapis.com/auth/firebase.messaging"]
        )
        self.session = AuthorizedSession(creds)
        self.url = f"https://fcm.googleapis.com/v1/projects/{info['project_id']}/messages:send"

    def send(self, sub: dict, payload: dict) -> None:
        message = {
            "token": sub["id"],
            "notification": {"title": payload["title"], "body": payload["body"]},
            "data": {"url": payload["url"]},
            "android": {
                "ttl": f"{TTL_SECONDS}s",
                "priority": "normal",
                "notification": {"channel_id": "morning", "tag": payload["tag"]},
            },
        }
        response = self.session.post(self.url, json={"message": message}, timeout=15)
        if response.ok:
            return
        codes = {d.get("errorCode") for d in response.json().get("error", {}).get("details", []) if isinstance(d, dict)}
        if response.status_code == 404 or "UNREGISTERED" in codes:
            raise Gone()
        raise RuntimeError(f"FCM {response.status_code}: {', '.join(c for c in codes if c) or 'error'}")


def load_service_account(value: str) -> dict:
    """El JSON de la cuenta de servicio (secreto de GitHub) o, en un PC, la ruta al archivo descargado."""
    if value.lstrip().startswith("{"):
        return json.loads(value)
    with open(value.strip().strip('"'), encoding="utf-8") as file:
        return json.load(file)


def load_day(client, day: str) -> tuple[list[dict], dict[int, str]]:
    start, end = M.day_bounds_utc(day)
    rows = (
        client.table("games")
        .select("id,game_datetime_utc,home_team_id,away_team_id,status,excitement_score")
        .gte("game_datetime_utc", start)
        .lt("game_datetime_utc", end)
        .execute()
        .data
    )
    names = {t["id"]: t["name"] for t in db.select_all(client, "teams", "id,name")}
    return rows, names


def mark_sent(client, ids: list[str], day: str) -> None:
    for i in range(0, len(ids), UPDATE_CHUNK):
        client.table("push_subscriptions").update({"last_sent_day": day}).in_("id", ids[i:i + UPDATE_CHUNK]).execute()


def delete(client, ids: list[str]) -> None:
    for i in range(0, len(ids), UPDATE_CHUNK):
        client.table("push_subscriptions").delete().in_("id", ids[i:i + UPDATE_CHUNK]).execute()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--hour", type=int, help="hora de España a simular")
    parser.add_argument("--test", action="store_true", help="aviso de prueba a todas las suscripciones")
    args = parser.parse_args()

    now = datetime.now(timezone.utc)
    hour = args.hour if args.hour is not None else M.spain_hour(now)
    if not args.test and not (M.HOURS[0] <= hour <= M.LAST_HOUR):
        print(f"Son las {hour}:00 en España: no toca aviso.")
        return 0

    client = db.connect()
    subs = db.select_all(client, "push_subscriptions", "id,platform,keys,hour,with_scores,team_ids,last_sent_day")
    day = M.last_night(now)

    if args.test:
        due = subs
        messages = {s["id"]: (M.TEST_TITLE, M.TEST_BODY) for s in subs}
    else:
        rows, names = load_day(client, day)
        if not rows:
            print(f"Jornada {day}: sin partidos, no hay aviso.")
            return 0
        ready = M.is_ready(rows, now)
        games = [M.Game(r["id"], r["game_datetime_utc"], r["away_team_id"], r["home_team_id"]) for r in rows]
        scores = {r["id"]: r["excitement_score"] for r in rows if r["excitement_score"] is not None}
        due = [s for s in subs if M.is_due(s["hour"], s["last_sent_day"], day, hour) and (ready or not s["with_scores"])]
        messages = {
            s["id"]: M.build_message(games, scores, names, set(s["team_ids"] or []), s["with_scores"]) for s in due
        }

    print(f"Jornada {day}: {len(due)} avisos por enviar ({len(subs)} suscripciones).")
    if args.dry_run or not due:
        return 0

    fcm = None
    if any(s["platform"] == "android" for s in due):
        if FCM_SERVICE_ACCOUNT:
            fcm = Fcm(load_service_account(FCM_SERVICE_ACCOUNT))
        else:
            print("Falta FCM_SERVICE_ACCOUNT: no se envía a Android.", file=sys.stderr)
    if not VAPID_PRIVATE_KEY and any(s["platform"] == "web" for s in due):
        print("Falta VAPID_PRIVATE_KEY: no se envía a la web.", file=sys.stderr)

    sent, gone, failed = [], [], 0
    for sub in due:
        title, body = messages[sub["id"]]
        payload = {"title": title, "body": body, "url": "/", "tag": f"morning-{day}"}
        try:
            if sub["platform"] == "web" and VAPID_PRIVATE_KEY:
                send_web(sub, payload)
            elif sub["platform"] == "android" and fcm:
                fcm.send(sub, payload)
            else:
                continue
            sent.append(sub["id"])
        except Gone:
            gone.append(sub["id"])
        except Exception as error:  # noqa: BLE001 - un fallo no para a los demás
            failed += 1
            print(f"Fallo al enviar ({sub['platform']}): {type(error).__name__}", file=sys.stderr)

    if not args.test:
        mark_sent(client, sent, day)
    delete(client, gone)
    print(f"Enviados: {len(sent)} · caducados (borrados): {len(gone)} · fallos: {failed}")
    return 1 if failed and not sent else 0


if __name__ == "__main__":
    sys.exit(main())
