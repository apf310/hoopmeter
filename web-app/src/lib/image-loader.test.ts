// Tests del loader de imágenes sin la optimización de Vercel (Tarea 6.17). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import imageLoader from "./image-loader.ts";
import { playerHeadshotUrl, teamLogoUrl } from "./nba-cdn.ts";

const shot = (width: number) => imageLoader({ src: playerHeadshotUrl(2544), width });

describe("imageLoader", () => {
  it("pide a la CDN la foto más pequeña que cubre el ancho", () => {
    assert.equal(shot(64), "https://cdn.nba.com/headshots/nba/latest/260x190/2544.png");
    assert.equal(shot(260), "https://cdn.nba.com/headshots/nba/latest/260x190/2544.png");
    assert.equal(shot(384), "https://cdn.nba.com/headshots/nba/latest/520x380/2544.png");
    assert.equal(shot(640), "https://cdn.nba.com/headshots/nba/latest/1040x760/2544.png");
  });

  it("nunca pide un tamaño que la CDN no tiene", () => {
    assert.equal(shot(3840), "https://cdn.nba.com/headshots/nba/latest/1040x760/2544.png");
  });

  it("nunca pasa por /_next/image", () => {
    for (const width of [16, 128, 1080, 3840]) {
      assert.ok(!shot(width).includes("/_next/image"));
      assert.ok(!imageLoader({ src: teamLogoUrl(1610612747), width }).includes("/_next/image"));
    }
  });

  it("deja tal cual lo que no es una foto de la CDN", () => {
    assert.equal(imageLoader({ src: "/logos/1610612747.svg", width: 64 }), "/logos/1610612747.svg");
    assert.equal(imageLoader({ src: "/icons/icon-192.png", width: 64 }), "/icons/icon-192.png");
  });
});

describe("teamLogoUrl", () => {
  it("sirve los 30 escudos desde la propia web", () => {
    for (let id = 1610612737; id <= 1610612766; id++) assert.equal(teamLogoUrl(id), `/logos/${id}.svg`);
  });

  it("un equipo fuera de los 30 sigue saliendo de la CDN", () => {
    assert.equal(teamLogoUrl(1610610024), "https://cdn.nba.com/logos/nba/1610610024/global/D/logo.svg");
  });
});
