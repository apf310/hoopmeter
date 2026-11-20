// Tests del aviso matinal (Tarea 6.14): preferencias del dispositivo y validación de suscripciones.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PUSH_STATE, parsePushState, parseSubscriptionBody, pushTeamIds, sameIds } from "./push.ts";

const WEB = {
  id: "https://fcm.googleapis.com/fcm/send/abcdefghijklmnop:APA91bHqrstuvwxyz",
  platform: "web",
  keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
  hour: 8,
  withScores: false,
  teamIds: [1610612738],
};

describe("parsePushState", () => {
  it("sin nada guardado o corrupto: desactivado", () => {
    assert.deepEqual(parsePushState(null), DEFAULT_PUSH_STATE);
    assert.deepEqual(parsePushState("{roto"), DEFAULT_PUSH_STATE);
  });

  it("activado sin id no cuenta como activado", () => {
    assert.equal(parsePushState(JSON.stringify({ enabled: true, hour: 9 })).enabled, false);
  });

  it("hora fuera de las permitidas vuelve a las 8", () => {
    assert.equal(parsePushState(JSON.stringify({ hour: 7 })).hour, 8);
  });

  it("lee lo guardado", () => {
    const state = { enabled: true, hour: 10, withScores: true, id: WEB.id, platform: "web", teamIds: [1, 2] };
    assert.deepEqual(parsePushState(JSON.stringify(state)), state);
  });

  it("nunca guarda el nivel de spoilers", () => {
    const parsed = parsePushState(JSON.stringify({ enabled: false, level: 3 }));
    assert.equal("level" in parsed, false);
  });
});

describe("pushTeamIds", () => {
  it("equipos favoritos y equipos de los jugadores favoritos, sin repetir y ordenados", () => {
    const ids = pushTeamIds({
      teams: [{ id: 30, name: "B", abbreviation: "B" }],
      players: [
        { id: 1, name: "X", teamId: 10 },
        { id: 2, name: "Y", teamId: 30 },
        { id: 3, name: "Z", teamId: null },
      ],
    });
    assert.deepEqual(ids, [10, 30]);
    assert.ok(sameIds(ids, [10, 30]));
    assert.ok(!sameIds(ids, [30, 10]));
  });
});

describe("parseSubscriptionBody", () => {
  it("acepta una suscripción web válida", () => {
    assert.equal(parseSubscriptionBody(WEB)?.platform, "web");
  });

  it("rechaza servicios de push desconocidos", () => {
    assert.equal(parseSubscriptionBody({ ...WEB, id: "https://evil.example.com/push/abcdefghijklmnopqrstuvwxyz" }), null);
    assert.equal(parseSubscriptionBody({ ...WEB, id: "https://fcm.googleapis.com.evil.com/x/abcdefghijklmnop" }), null);
  });

  it("rechaza horas, claves y favoritos no válidos", () => {
    assert.equal(parseSubscriptionBody({ ...WEB, hour: 7 }), null);
    assert.equal(parseSubscriptionBody({ ...WEB, keys: { p256dh: "a b", auth: "x" } }), null);
    assert.equal(parseSubscriptionBody({ ...WEB, teamIds: Array.from({ length: 31 }, (_, i) => i + 1) }), null);
    assert.equal(parseSubscriptionBody({ ...WEB, withScores: "si" }), null);
  });

  it("Android: token de FCM, sin claves", () => {
    const body = parseSubscriptionBody({ ...WEB, platform: "android", id: "dGVzdC10b2tlbi1mY20:APA91bH-abc_123", keys: { x: 1 } });
    assert.equal(body?.platform, "android");
    assert.equal(body?.keys, null);
    assert.equal(parseSubscriptionBody({ ...WEB, platform: "android", id: "https://fcm.googleapis.com/x" }), null);
  });
});
