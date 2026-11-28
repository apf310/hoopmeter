// Tests de las cuentas (Tarea 8.5): lo que trae la cuenta y cómo se junta con lo del dispositivo. Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accountFromRow, favoritesSync, mergeAccountResults, pendingReceipts, readAccountView, resultsFromRows } from "./account.ts";
import { eloOf, PAR_PRIOR, parOf } from "./elo.ts";
import { EMPTY_FAVORITES, parseFavorites, parseFavoritesAt, serializeFavorites, unionFavorites, type Favorites } from "./favorites.ts";
import { EMPTY_PROGRESS, type ChallengeResult, type GamesProgress } from "./games.ts";

const lakers = { id: 1610612747, name: "Los Angeles Lakers", abbreviation: "LAL" };
const celtics = { id: 1610612738, name: "Boston Celtics", abbreviation: "BOS" };
const luka = { id: 1629029, name: "Luka Dončić", teamId: 1610612747 };
const fav = (teams: (typeof lakers)[], players: (typeof luka)[] = []): Favorites => ({ teams, players });

const result = (day: string, game: ChallengeResult["game"], points: number, extra: Partial<ChallengeResult> = {}): ChallengeResult => ({
  day,
  game,
  points,
  rows: [],
  ...extra,
});
const progressOf = (results: ChallengeResult[]): GamesProgress => ({ ...EMPTY_PROGRESS, results });

describe("cuenta · lo que devuelve la base de datos", () => {
  it("cada resultado con el par que calcula el servidor (el de siempre si no hay datos)", () => {
    const results = resultsFromRows([
      { day: "2026-11-27", game: "mas-o-menos", points: 40, rows: ["oooooooooo"], par_n: 50, par_median: 36 },
      { day: "2026-11-27", game: "adivina", points: 14, rows: ["xcoxx", "ooooo"], par_n: null, par_median: null },
    ]);
    assert.equal(results[0].par, parOf("mas-o-menos", { n: 50, median: 36 }));
    assert.equal(results[1].par, PAR_PRIOR.adivina);
    assert.deepEqual(results[1].rows, ["xcoxx", "ooooo"]);
  });

  it("filas rotas fuera, nunca un error", () => {
    assert.deepEqual(resultsFromRows(null), []);
    assert.deepEqual(resultsFromRows([null, { day: "ayer", game: "adivina", points: 1 }, { day: "2026-11-27", game: "porra", points: 1 }]), []);
  });

  it("la cuenta, o null si aún no tiene alias", () => {
    assert.equal(accountFromRow(null), null);
    const account = accountFromRow({
      alias: "Triple_23",
      alias_changed_at: null,
      created_at: "2026-11-28T10:00:00Z",
      favorites: { teams: [lakers], players: [] },
      favorites_at: 1_764_000_000_000,
      results: [],
    });
    assert.equal(account?.alias, "Triple_23");
    assert.deepEqual(account?.favorites.teams, [lakers]);
    assert.equal(account?.favoritesAt, 1_764_000_000_000);
  });

  it("lo que llega a la app pasa por el mismo filtro que lo del dispositivo", () => {
    const view = readAccountView({
      alias: "Triple_23",
      createdAt: "2026-11-28T10:00:00Z",
      favorites: { teams: [lakers, { id: -1 }] },
      favoritesAt: 5,
      results: [result("2026-11-27", "adivina", 99), result("2026-11-27", "adivina", 14), result("2026-11-27", "adivina", 17)],
    });
    assert.deepEqual(view?.favorites.teams, [lakers]);
    // 99 es imposible; de los otros dos, solo el primero (un reto cuenta una vez al día)
    assert.deepEqual(view?.results.map((r) => r.points), [14]);
  });
});

describe("cuenta · resultados", () => {
  it("para cada reto y día manda la cuenta; lo que solo tiene el dispositivo se queda", () => {
    const device = progressOf([
      result("2026-11-26", "adivina", 20, { receipt: "r1.a.b" }),
      result("2026-11-27", "adivina", 5),
      result("2026-11-27", "mas-o-menos", 30, { receipt: "r1.c.d" }),
    ]);
    const account = [result("2026-11-27", "adivina", 17, { par: 0.5 }), result("2026-11-28", "carrera", 10, { par: 0.4 })];
    const merged = mergeAccountResults(device, account);
    assert.deepEqual(
      merged.results.map((r) => `${r.day} ${r.game} ${r.points}`),
      ["2026-11-26 adivina 20", "2026-11-27 adivina 17", "2026-11-27 mas-o-menos 30", "2026-11-28 carrera 10"]
    );
    assert.equal(merged.results[1].receipt, undefined);
  });

  it("sin cambios, el mismo objeto (no repinta en balde)", () => {
    const device = progressOf([result("2026-11-27", "adivina", 17, { par: 0.5 })]);
    assert.equal(mergeAccountResults(device, [result("2026-11-27", "adivina", 17, { par: 0.5 })]), device);
  });

  it("se mandan los recibos de lo que la cuenta no tiene, en orden", () => {
    const device = progressOf([
      result("2026-11-26", "adivina", 20, { receipt: "r1.a.b" }),
      result("2026-11-27", "adivina", 5, { receipt: "r1.e.f" }),
      result("2026-11-27", "mas-o-menos", 30, { receipt: "r1.c.d" }),
      result("2026-11-27", "carrera", 3),
    ]);
    assert.deepEqual(pendingReceipts(device, [result("2026-11-27", "adivina", 17)]), ["r1.a.b", "r1.c.d"]);
  });

  it("el ELO sale igual en cualquier dispositivo con los resultados de la cuenta", () => {
    const account = [result("2026-11-26", "mas-o-menos", 50, { par: 0.6 }), result("2026-11-27", "adivina", 17, { par: 0.55 })];
    const phone = mergeAccountResults(progressOf([result("2026-11-26", "mas-o-menos", 50, { par: 0.58 })]), account);
    const laptop = mergeAccountResults(EMPTY_PROGRESS, account);
    assert.equal(eloOf(phone.results).elo, eloOf(laptop.results).elo);
  });
});

describe("cuenta · favoritos", () => {
  it("se guarda cuándo cambiaron (y los de antes de las cuentas, a 0)", () => {
    const raw = serializeFavorites(fav([lakers]), 1234);
    assert.equal(parseFavoritesAt(raw), 1234);
    assert.deepEqual(parseFavorites(raw), fav([lakers]));
    assert.equal(parseFavoritesAt(JSON.stringify(fav([lakers]))), 0);
    assert.equal(parseFavoritesAt("roto"), 0);
  });

  it("juntos: primero los del dispositivo y sin repetir", () => {
    assert.deepEqual(unionFavorites(fav([lakers]), fav([celtics, lakers], [luka])), fav([lakers, celtics], [luka]));
    assert.equal(unionFavorites(EMPTY_FAVORITES, EMPTY_FAVORITES), EMPTY_FAVORITES);
  });

  it("al entrar desde un dispositivo se juntan y se suben", () => {
    const plan = favoritesSync({ favorites: fav([lakers]), at: 0 }, { favorites: fav([celtics]), at: 100 }, { linking: true, now: 500 });
    assert.deepEqual(plan.push, { favorites: fav([lakers, celtics]), at: 500 });
    assert.deepEqual(plan.local, plan.push);
  });

  it("al entrar, si la cuenta ya los tiene todos, solo bajan", () => {
    const plan = favoritesSync({ favorites: fav([lakers]), at: 0 }, { favorites: fav([lakers, celtics]), at: 100 }, { linking: true, now: 500 });
    assert.equal(plan.push, undefined);
    assert.deepEqual(plan.local, { favorites: fav([lakers, celtics]), at: 100 });
    assert.deepEqual(favoritesSync({ favorites: fav([lakers]), at: 100 }, { favorites: fav([lakers]), at: 100 }, { linking: true, now: 500 }), {});
  });

  it("después gana el cambio más reciente: quitar uno en el móvil lo quita en el ordenador", () => {
    // El ordenador aún tiene los Celtics; el móvil los quitó después
    const laptop = { favorites: fav([lakers, celtics]), at: 100 };
    const account = { favorites: fav([lakers]), at: 200 };
    assert.deepEqual(favoritesSync(laptop, account, { linking: false, now: 300 }), { local: account });
    // Y al revés: lo cambiado en este dispositivo después, sube
    assert.deepEqual(favoritesSync({ favorites: fav([celtics]), at: 300 }, account, { linking: false, now: 400 }), {
      push: { favorites: fav([celtics]), at: 300 },
    });
  });
});
