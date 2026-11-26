import assert from "node:assert/strict";
import { test } from "node:test";
import { buildHuella, CARD_ASPECT, facetsOf, huellaFromAttributes, huellaFromHonours, type Huella } from "./card-huella.ts";
import type { CardTier } from "./player-card.ts";

const TIERS: CardTier[] = ["legend", "elite", "great", "good", "base"];
const DONCIC = huellaFromAttributes([98, 93, 98, 96, 86, 96])!;
const MARA = huellaFromAttributes([65, 44, 64, 82, 94, 92])!;

const lines = (h: Huella) => [...h.main.strokes, ...h.accent.strokes].flatMap((s) => s.lines.flat());
// En el zafiro la rejilla es la misma para todos: lo que cambia es la altura de cada faceta
const flat = (h: Huella) => [...lines(h), ...h.accent.facets.map((f) => f.height)];

test("los atributos de 40 a 99 van de casi 0 a 1, con dos decimales; sin partidos no hay huella", () => {
  assert.deepEqual(huellaFromAttributes([99, 40, 69.5, 84, 55, 70]), [1, 0.03, 0.5, 0.75, 0.25, 0.51]);
  assert.equal(huellaFromAttributes([0, 0, 0, 0, 0, 0]), null);
  assert.equal(huellaFromAttributes([80, 80]), null);
  // Fuera de escala, se recorta
  assert.deepEqual(huellaFromAttributes([120, 10, 60, 60, 60, 60])?.slice(0, 2), [1, 0.03]);
});

test("el palmarés de una leyenda crece con cada premio y nunca pasa de 1", () => {
  const jordan = huellaFromHonours({ champion: 6, mvp: 5, fmvp: 6, allnba: 11, alldef: 9, allstar: 14 });
  const none = huellaFromHonours({});
  assert.equal(jordan.length, 6);
  assert.ok(jordan.every((v) => v > 0.75 && v <= 1));
  assert.deepEqual(none, [0.12, 0.12, 0.12, 0.12, 0.12, 0.12]);
  for (let n = 0; n < 20; n++) assert.ok(huellaFromHonours({ allstar: n + 1 })[5] >= huellaFromHonours({ allstar: n })[5]);
  assert.ok(huellaFromHonours({ champion: 1 })[0] > huellaFromHonours({ allstar: 1 })[5], "un anillo pesa más que un All-Star");
});

test("no hay dos iguales: el mismo jugador da el mismo dibujo y otro jugador, otro", () => {
  for (const tier of TIERS) {
    assert.deepEqual(buildHuella(tier, DONCIC), buildHuella(tier, DONCIC), tier);
    assert.notDeepEqual(flat(buildHuella(tier, DONCIC)), flat(buildHuella(tier, MARA)), tier);
  }
  // Un solo atributo distinto ya cambia el dibujo
  const other = [...DONCIC];
  other[3] = 0.5;
  for (const tier of TIERS) assert.notDeepEqual(flat(buildHuella(tier, DONCIC)), flat(buildHuella(tier, other)), tier);
});

test("cada material dibuja con su técnica y todo cae dentro del arte o cerca del borde", () => {
  for (const tier of TIERS) {
    const h = buildHuella(tier, MARA);
    assert.ok(h.main.strokes.some((s) => s.lines.length > 0), `${tier}: sin dibujo`);
    const xs = lines(h).filter((_, i) => i % 2 === 0);
    const ys = lines(h).filter((_, i) => i % 2 === 1);
    assert.ok(xs.every(Number.isFinite) && ys.every(Number.isFinite), tier);
    // Las rosetas y los rayos pueden salirse un poco (se recortan con la carta), nunca irse lejos
    assert.ok(Math.min(...xs) > -1 && Math.max(...xs) < 2, tier);
    assert.ok(Math.min(...ys) > -1 && Math.max(...ys) < CARD_ASPECT + 1, tier);
  }
  assert.equal(buildHuella("good", MARA).accent.facets.length, facetsOf(MARA).length);
  assert.ok(buildHuella("legend", MARA).main.strokes[0].lines.length === 54);
});

test("las facetas son más altas en el lado del atributo mejor", () => {
  // Solo rebote (abajo a la izquierda en el radar) frente a solo anotación (arriba)
  const top = facetsOf([1, 0.03, 0.03, 0.03, 0.03, 0.03]);
  const centre = (f: { points: number[] }) => (f.points[1] + f.points[3] + f.points[5]) / 3;
  const high = (list: typeof top, upper: boolean) =>
    list.filter((f) => (upper ? centre(f) < 0.35 : centre(f) > 0.9)).reduce((s, f) => s + f.height, 0);
  assert.ok(high(top, true) > high(top, false));
  for (const f of top) assert.ok(f.height >= 0 && f.height <= 1.1);
});

test("las cartas pequeñas llevan menos líneas", () => {
  const big = buildHuella("legend", DONCIC);
  const mini = buildHuella("legend", DONCIC, { detail: 0.5 });
  assert.ok(mini.main.strokes[0].lines.length < big.main.strokes[0].lines.length);
  assert.ok(lines(mini).length < lines(big).length / 2);
});
