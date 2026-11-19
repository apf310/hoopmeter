// Tests de los favoritos sin cuenta (Tarea 6.10). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPTY_FAVORITES,
  MAX_FAVORITES,
  decodeFavoritesCookie,
  encodeFavoritesCookie,
  favoriteTeamReasons,
  parseFavorites,
  serializeFavorites,
  sortFavoritesFirst,
  togglePlayer,
  toggleTeam,
  updatePlayerTeams,
  type Favorites,
} from "./favorites.ts";

const LAL = { id: 1610612747, name: "Los Angeles Lakers", abbreviation: "LAL" };
const BOS = { id: 1610612738, name: "Boston Celtics", abbreviation: "BOS" };
const DAL = 1610612742;
const ORL = 1610612753;
const MEM = 1610612763;
const luka = { id: 1629029, name: "Luka Dončić", teamId: LAL.id };
const santi = { id: 1630700, name: "Santi Aldama", teamId: MEM };

const game = (id: string, away: number, home: number) => ({ id, game_datetime_utc: "2026-11-19T00:00:00Z", away_team_id: away, home_team_id: home });

describe("parseFavorites", () => {
  it("vacío, roto o con otra forma: sin favoritos y sin romper", () => {
    for (const raw of [null, "", "{", "null", "42", '"x"', "[]", '{"teams":"LAL"}']) {
      assert.deepEqual(parseFavorites(raw), EMPTY_FAVORITES, String(raw));
    }
  });

  it("ida y vuelta con lo guardado", () => {
    const favorites: Favorites = { teams: [LAL, BOS], players: [luka, { ...santi, teamId: null }] };
    assert.deepEqual(parseFavorites(serializeFavorites(favorites)), favorites);
  });

  it("descarta entradas inválidas, duplicadas y lo que no sea de un favorito", () => {
    const raw = JSON.stringify({
      teams: [LAL, { ...LAL, name: "Otro" }, { id: "BOS", name: "Boston", abbreviation: "BOS" }, null],
      players: [{ ...luka, teamId: -1, level: 3 }, { id: 0, name: "X" }, { id: 5, name: "  " }],
      spoilerLevel: 3,
    });
    const parsed = parseFavorites(raw);
    assert.deepEqual(parsed, { teams: [LAL], players: [{ ...luka, teamId: null }] });
    assert.equal("spoilerLevel" in parsed, false);
  });

  it("nunca guarda más del tope", () => {
    const teams = Array.from({ length: MAX_FAVORITES + 5 }, (_, i) => ({ id: i + 1, name: `T${i}`, abbreviation: "T" }));
    assert.equal(parseFavorites(JSON.stringify({ teams, players: [] })).teams.length, MAX_FAVORITES);
  });
});

describe("cookie de favoritos", () => {
  it("ida y vuelta solo con ids (sin nombres ni nivel de spoilers)", () => {
    const value = encodeFavoritesCookie({ teams: [LAL, BOS], players: [luka, { ...santi, teamId: null }] });
    assert.equal(value, `${LAL.id}.${BOS.id}_${luka.id}-${LAL.id}.${santi.id}-0`);
    assert.match(value, /^[0-9._-]+$/);
    assert.deepEqual(decodeFavoritesCookie(value), {
      teams: [LAL.id, BOS.id],
      players: [
        { id: luka.id, teamId: LAL.id },
        { id: santi.id, teamId: null },
      ],
    });
  });

  it("vacía o rota: sin favoritos", () => {
    assert.equal(encodeFavoritesCookie(EMPTY_FAVORITES), "");
    for (const value of [undefined, "", "_", "abc", "-1.x_-5.y-z.0-3"]) {
      assert.deepEqual(decodeFavoritesCookie(value), { teams: [], players: [] }, String(value));
    }
    assert.deepEqual(decodeFavoritesCookie("_7-0"), { teams: [], players: [{ id: 7, teamId: null }] });
  });
});

describe("toggleTeam / togglePlayer", () => {
  it("marca al final y desmarca", () => {
    let favorites = toggleTeam(EMPTY_FAVORITES, LAL);
    favorites = toggleTeam(favorites, BOS);
    assert.deepEqual(favorites.teams.map((t) => t.abbreviation), ["LAL", "BOS"]);
    favorites = toggleTeam(favorites, LAL);
    assert.deepEqual(favorites.teams, [BOS]);
    favorites = togglePlayer(favorites, luka);
    assert.deepEqual(favorites.players, [luka]);
    assert.deepEqual(togglePlayer(favorites, luka).players, []);
  });

  it("no toca la constante vacía", () => {
    toggleTeam(EMPTY_FAVORITES, LAL);
    assert.deepEqual(EMPTY_FAVORITES, { teams: [], players: [] });
  });
});

describe("updatePlayerTeams", () => {
  it("pone al día el equipo tras un traspaso", () => {
    const favorites: Favorites = { teams: [], players: [{ ...luka, teamId: DAL }, santi] };
    const next = updatePlayerTeams(favorites, new Map([[luka.id, { teamId: LAL.id }]]));
    assert.deepEqual(next.players, [luka, santi]);
  });

  it("sin cambios devuelve el mismo objeto (no escribe ni repinta)", () => {
    const favorites: Favorites = { teams: [], players: [luka] };
    assert.equal(updatePlayerTeams(favorites, new Map([[luka.id, { teamId: LAL.id, name: luka.name }]])), favorites);
    assert.equal(updatePlayerTeams(favorites, new Map()), favorites);
  });
});

describe("favoriteTeamReasons", () => {
  it("equipo marcado manda; los jugadores añaden el suyo con su nombre", () => {
    const reasons = favoriteTeamReasons({ teams: [LAL], players: [luka, santi, { id: 9, name: "Agente libre", teamId: null }] });
    assert.deepEqual([...reasons], [
      [LAL.id, "Tu equipo"],
      [MEM, "Equipo de Santi Aldama"],
    ]);
  });
});

describe("sortFavoritesFirst", () => {
  const day = [game("a", BOS.id, ORL), game("b", DAL, LAL.id), game("c", ORL, MEM), game("d", BOS.id, DAL)];

  it("los de tus favoritos primero, manteniendo la hora dentro de cada grupo", () => {
    const teams = favoriteTeamReasons({ teams: [], players: [santi, { ...luka, teamId: DAL }] });
    assert.deepEqual(sortFavoritesFirst(day, teams).map((g) => g.id), ["b", "c", "d", "a"]);
  });

  it("sin favoritos en la jornada, el mismo orden (y el mismo array)", () => {
    assert.equal(sortFavoritesFirst(day, new Set()), day);
    assert.equal(sortFavoritesFirst(day, new Set([999])), day);
  });

  it("solo mira los equipos: añadir nota o marcador no cambia el orden (igual en los 3 niveles)", () => {
    const teams = new Set([ORL]);
    const level1 = sortFavoritesFirst(day, teams).map((g) => g.id);
    const level3 = sortFavoritesFirst(
      day.map((g, i) => ({ ...g, home_score: 100 + i, away_score: 120 - i, excitement_score: 9 - i, status: "Final" })),
      teams
    ).map((g) => g.id);
    assert.deepEqual(level3, level1);
  });
});
