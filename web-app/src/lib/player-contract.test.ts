// Tests del contrato año a año de la ficha del jugador (Tarea 6.8). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildContractView, nextSeason } from "./player-contract.ts";
import type { PlayerContract } from "./supabase.ts";

const contract = (overrides: Partial<PlayerContract>): PlayerContract => ({
  player_id: 1,
  salary_current: 10_000_000,
  salary_year_2: 11_000_000,
  salary_year_3: null,
  salary_year_4: null,
  contract_option: null,
  signed_on: null,
  signed_kind: null,
  acquired_on: null,
  status: "confirmed",
  source: null,
  ...overrides,
});

describe("contrato año a año", () => {
  it("cambia de temporada bien en el cambio de siglo", () => {
    assert.equal(nextSeason("2026-27"), "2027-28");
    assert.equal(nextSeason("2098-99"), "2099-00");
  });

  it("una fila por temporada con cifra y el total", () => {
    const view = buildContractView(contract({ contract_option: "Player Option" }), "2026-27");
    assert.deepEqual(view.years, [
      { season: "2026-27", salary: 10_000_000, status: "confirmed" },
      { season: "2027-28", salary: 11_000_000, status: "confirmed" },
    ]);
    assert.equal(view.total, 21_000_000);
    assert.equal(view.option, "Player Option");
    assert.equal(view.maybeLonger, false);
  });

  it("las aproximadas se marcan en todos los años", () => {
    const view = buildContractView(contract({ source: { precision: "approx" } }), "2026-27");
    assert.equal(view.status, "approx");
    assert.ok(view.years.every((year) => year.status === "approx"));
  });

  it("sin cifra pública: una sola fila sin cifra, nunca inventada, y lo que dijo la prensa", () => {
    const view = buildContractView(
      contract({
        status: "pending",
        salary_current: null,
        salary_year_2: 5_000_000,
        source: { reported: { years: 3, total: null, minimum: false }, items: [{ outlet: "Hoops Rumors", url: "https://x", title: "", published_at: "" }] },
      }),
      "2026-27"
    );
    assert.deepEqual(view.years, [{ season: "2026-27", salary: null, status: "pending" }]);
    assert.equal(view.total, null);
    assert.deepEqual(view.reported, { years: 3, total: null, minimum: false, outlet: "Hoops Rumors", url: "https://x" });
  });

  it("renovación sin cifra: los años conocidos y después la renovación, sin total", () => {
    const view = buildContractView(contract({ status: "pending_future", salary_year_2: null }), "2026-27");
    assert.deepEqual(view.years.map((year) => [year.season, year.status]), [
      ["2026-27", "confirmed"],
      ["2027-28", "renewal"],
    ]);
    assert.equal(view.total, null);
  });

  it("un hueco cierra el contrato; con los 4 años llenos puede seguir después", () => {
    assert.equal(buildContractView(contract({ salary_year_2: null, salary_year_3: 9 }), "2026-27").years.length, 1);
    const full = buildContractView(contract({ salary_year_3: 12, salary_year_4: 13 }), "2026-27");
    assert.equal(full.years.at(-1)?.season, "2029-30");
    assert.equal(full.maybeLonger, true);
  });
});
