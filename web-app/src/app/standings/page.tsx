import type { Metadata } from "next";
import { StandingsBoard } from "@/components/standings/StandingsBoard";
import type { TeamIdentity } from "@/components/standings/StandingsTable";
import { BRAND } from "@/lib/brand";
import { getStandingsBefore, getTeams } from "@/lib/queries";

export const metadata: Metadata = {
  title: `Clasificación · ${BRAND.name}`,
};

export default async function StandingsPage() {
  const [teams, before] = await Promise.all([getTeams(), getStandingsBefore()]);
  // Al navegador solo viajan los datos fijos de cada equipo y la clasificación de antes de la jornada
  // (Tarea 6.6): la de al día la pide el Nivel 3 a /api/standings. Tampoco nóminas ni contratos.
  const identities: TeamIdentity[] = teams.map((t) => ({
    id: t.id,
    name: t.name,
    abbreviation: t.abbreviation,
    conference: t.conference,
    primary_color: t.primary_color,
    secondary_color: t.secondary_color,
  }));

  return <StandingsBoard teams={identities} before={before} />;
}
