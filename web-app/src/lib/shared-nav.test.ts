import assert from "node:assert/strict";
import { test } from "node:test";
import { createSharedNav, pendingTeams, returnTrip, sharedName, sharedTarget } from "./shared-nav.ts";

const ORIGIN = { instance: "a", href: "/games/0022600123", teams: { away: 1, home: 2 }, from: "/?fecha=2026-11-24", scrollY: 640 };

test("solo las fichas de jugador, equipo y partido tienen algo que transportar", () => {
  assert.deepEqual(sharedTarget("/players/203999"), { kind: "player", id: 203999 });
  assert.deepEqual(sharedTarget("/players/203999?x=1#atributos"), { kind: "player", id: 203999 });
  assert.deepEqual(sharedTarget("/teams/1610612743"), { kind: "team", id: 1610612743 });
  // El id de un partido es texto: con número se perderían los ceros de delante
  assert.deepEqual(sharedTarget("/games/0022600123"), { kind: "game", id: "0022600123" });
  for (const href of ["/", "/players", "/players?posicion=pivot", "/compare?a=1&b=2", "/teams/abc", "https://x.com/players/1"]) {
    assert.equal(sharedTarget(href), null, href);
  }
});

test("origen y destino comparten nombre y los dos escudos de un partido no se confunden", () => {
  assert.equal(sharedName(sharedTarget("/players/2544")!), "player-2544-main");
  const game = sharedTarget("/games/0022600123")!;
  assert.notEqual(sharedName(game, "away"), sharedName(game, "home"));
});

test("el hueco de carga solo enseña los escudos del partido que se acaba de tocar", () => {
  const nav = createSharedNav();
  assert.equal(pendingTeams(nav.get()), null);
  nav.start(ORIGIN);
  assert.deepEqual(pendingTeams(nav.get()), { away: 1, home: 2 });
  // Después se va a otro partido por un enlace normal (el buscador, por ejemplo)
  nav.plain("/games/0022600999");
  assert.equal(pendingTeams(nav.get()), null);
});

test("al volver atrás se conserva el origen, pero ya no es el destino", () => {
  const nav = createSharedNav();
  nav.start(ORIGIN);
  nav.back("/");
  assert.equal(nav.get().origin?.instance, "a");
  assert.equal(pendingTeams(nav.get()), null);
});

test("avisa a quien escucha y deja de hacerlo al darse de baja", () => {
  const nav = createSharedNav();
  let calls = 0;
  const off = nav.subscribe(() => calls++);
  nav.plain("/");
  off();
  nav.plain("/teams");
  assert.equal(calls, 1);
});

test("el viaje de vuelta solo se hace de la ficha a la lista exacta en la que se tocó", () => {
  const nav = createSharedNav();
  const game = new Set(["game-0022600123-away", "game-0022600123-home"]);
  assert.equal(returnTrip(nav.get(), game, "/?fecha=2026-11-24"), null);
  nav.start(ORIGIN);
  assert.equal(returnTrip(nav.get(), game, "/?fecha=2026-11-24")?.scrollY, 640);
  assert.equal(returnTrip(nav.get(), game, "/"), null);
  assert.equal(returnTrip(nav.get(), new Set(["player-2544-main"]), "/?fecha=2026-11-24"), null);
  assert.equal(returnTrip(nav.get(), new Set(), "/?fecha=2026-11-24"), null);
});
