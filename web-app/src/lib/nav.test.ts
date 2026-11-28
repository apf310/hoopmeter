// Tests de la navegación (Tarea 8.1). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { navSection, sidebarSection } from "./nav.ts";

describe("navSection · la pestaña de cada pantalla", () => {
  it("Inicio: portada, partidos, Qué ver y avisos", () => {
    for (const path of ["/", "/games/0022600170", "/que-ver", "/avisos"]) assert.equal(navSection(path), "/", path);
  });

  it("Liga: clasificación y equipos", () => {
    for (const path of ["/standings", "/teams", "/teams/1610612747-los-angeles-lakers"]) assert.equal(navSection(path), "/standings", path);
  });

  it("Jugadores: explorador, fichas y comparador", () => {
    for (const path of ["/players", "/players/203999-nikola-jokic", "/compare"]) assert.equal(navSection(path), "/players", path);
  });

  it("GM y Juegos", () => {
    assert.equal(navSection("/gm-simulator"), "/gm-simulator");
    assert.equal(navSection("/juegos"), "/juegos");
    // La cuenta: en el móvil se llega desde Juegos
    assert.equal(navSection("/cuenta"), "/juegos");
  });

  it("las páginas legales no marcan ninguna, y un prefijo parecido tampoco", () => {
    for (const path of ["/acerca", "/privacidad", "/aviso-legal", "/teamsx", "/gamesx", "/juegosx"]) assert.equal(navSection(path), null, path);
  });
});

describe("sidebarSection · escritorio", () => {
  it("Qué ver y el aviso de la mañana se marcan solos, sin Inicio", () => {
    assert.equal(sidebarSection("/que-ver"), "/que-ver");
    assert.equal(sidebarSection("/avisos"), "/avisos");
    assert.equal(sidebarSection("/cuenta"), "/cuenta");
    assert.equal(sidebarSection("/games/0022600170"), "/");
    assert.equal(sidebarSection("/compare"), "/players");
  });
});
