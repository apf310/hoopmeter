import type { Metadata } from "next";
import { StandingsBoard } from "@/components/standings/StandingsBoard";
import type { TeamIdentity } from "@/components/standings/StandingsTable";
import { pageMetadata } from "@/lib/seo";
import { getStandingsBefore, getTeams } from "@/lib/queries";

export const metadata: Metadata = pageMetadata({
  title: "Clasificación",
  description: "Clasificación de la NBA por conferencias, con playoffs, play-in y lotería. Sin spoilers: al día solo si lo pides.",
  path: "/standings",
});

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
