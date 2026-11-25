import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cdnHeaders, dailyLife, dailyWindow, dayWindow, scoresWindow } from "./cache-window.ts";

const at = (iso: string) => Date.parse(iso);
const HOUR = 3600;

describe("dailyWindow", () => {
  it("nunca pasa del próximo job diario, a ninguna hora", () => {
    const job = at("2026-11-25T10:30:00Z");
    const jobEnd = job + 90 * 60_000;
    for (let minute = 0; minute < 24 * 60; minute++) {
      const now = at("2026-11-25T00:00:00Z") + minute * 60_000;
      const { fresh, expire } = dailyWindow(now);
      assert.ok(fresh <= expire);
      const limit = now < job ? job : now < jobEnd ? now + 300_000 : job + 24 * HOUR * 1000;
      assert.ok(now + expire * 1000 <= limit, `${new Date(now).toISOString()} dura ${expire}`);
    }
  });

  it("antes del job, solo hasta él", () => {
    assert.deepEqual(dailyWindow(at("2026-11-25T10:00:00Z")), { fresh: 1800, expire: 1800 });
    assert.deepEqual(dailyWindow(at("2026-11-25T07:30:00Z")), { fresh: HOUR, expire: 3 * HOUR });
  });

  it("mientras el job puede estar escribiendo, 5 minutos", () => {
    for (const time of ["10:30:00", "11:10:00", "11:59:59"]) assert.deepEqual(dailyWindow(at(`2026-11-25T${time}Z`)), { fresh: 300, expire: 300 });
  });

  it("después, casi un día entero, refrescando cada hora", () => {
    assert.deepEqual(dailyWindow(at("2026-11-25T12:00:00Z")), { fresh: HOUR, expire: 22.5 * HOUR });
  });
});

describe("dailyLife", () => {
  it("cumple siempre lo que exige Next: caduca después de refrescarse y en 5 minutos o más", () => {
    for (let minute = 0; minute < 24 * 60; minute++) {
      const life = dailyLife(at("2026-11-25T00:00:00Z") + minute * 60_000 + 59_999);
      assert.ok(life.expire > life.revalidate && life.revalidate >= 300 && life.stale >= 300);
    }
  });
});

describe("scoresWindow", () => {
  const now = at("2026-11-25T09:00:00Z");

  it("con un partido que ya puede haber terminado y sin nota, un minuto", () => {
    assert.deepEqual(scoresWindow([{ game_datetime_utc: "2026-11-25T07:00:00Z", scored: false }], now), { fresh: 60, expire: 120 });
  });

  it("sin nada pendiente, hasta que el próximo pueda haber terminado", () => {
    const games = [
      { game_datetime_utc: "2026-11-25T03:00:00Z", scored: true },
      { game_datetime_utc: "2026-11-25T12:00:00Z", scored: false },
      { game_datetime_utc: "2026-11-25T15:00:00Z", scored: false },
    ];
    assert.deepEqual(scoresWindow(games, now), { fresh: HOUR, expire: 4.5 * HOUR });
  });

  it("un partido recién empezado aún no puede tener nota", () => {
    assert.deepEqual(scoresWindow([{ game_datetime_utc: "2026-11-25T08:30:00Z", scored: false }], now), { fresh: HOUR, expire: HOUR });
  });

  it("un aplazado de ayer no deja la caché en un minuto para siempre", () => {
    assert.deepEqual(scoresWindow([{ game_datetime_utc: "2026-11-24T20:00:00Z", scored: false }], now), { fresh: HOUR, expire: 12 * HOUR });
  });

  it("nunca sirve lo de antes cuando ya puede haber una nota nueva", () => {
    for (let minutes = -710; minutes <= 900; minutes += 7) {
      const tipoff = now + minutes * 60_000;
      const earliestEnd = tipoff + 90 * 60_000;
      const { expire } = scoresWindow([{ game_datetime_utc: new Date(tipoff).toISOString(), scored: false }], now);
      if (earliestEnd > now) assert.ok(now + expire * 1000 <= Math.max(earliestEnd, now + 60_000));
      else assert.ok(expire <= 120);
    }
  });
});

describe("dayWindow", () => {
  const game = (status: string, score: number | null, utc = "2026-11-25T00:30:00Z") => ({ game_datetime_utc: utc, status, excitement_score: score });
  const live = { fresh: 30, expire: 60 };

  it("jornada terminada y con todas las notas: horas", () => {
    assert.deepEqual(dayWindow([game("Final", 7), game("Final", 5.5)], at("2026-11-25T09:00:00Z")), { fresh: HOUR, expire: 24 * HOUR });
  });

  it("si falta una nota o queda un partido, 30 segundos", () => {
    assert.deepEqual(dayWindow([game("Final", 7), game("Final", null)], at("2026-11-25T09:00:00Z")), live);
    assert.deepEqual(dayWindow([game("Final", 7), game("Live", null)], at("2026-11-25T03:00:00Z")), live);
    assert.deepEqual(dayWindow([game("Final", 7), game("Scheduled", null, "2026-11-25T04:00:00Z")], at("2026-11-25T03:00:00Z")), live);
    assert.deepEqual(dayWindow([], at("2026-11-25T03:00:00Z")), live);
  });

  it("sin empezar: hasta el primer salto inicial", () => {
    const games = [game("Scheduled", null, "2026-11-25T03:00:00Z"), game("Scheduled", null, "2026-11-25T00:30:00Z")];
    assert.deepEqual(dayWindow(games, at("2026-11-24T22:30:00Z")), { fresh: HOUR, expire: 2 * HOUR });
    // Ya es la hora, aunque el watcher aún no haya marcado el inicio
    assert.deepEqual(dayWindow(games, at("2026-11-25T00:31:00Z")), live);
  });
});

describe("cdnHeaders", () => {
  it("las dos partes juntas no pasan de la ventana", () => {
    assert.equal(cdnHeaders({ fresh: 60, expire: 100 })["Cache-Control"], "public, max-age=0, s-maxage=60, stale-while-revalidate=40");
    assert.equal(cdnHeaders({ fresh: 300, expire: 300 }, 300)["Cache-Control"], "public, max-age=300, s-maxage=300, stale-while-revalidate=0");
  });
});
