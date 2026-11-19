"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { TeamCardExport, type TeamCardData, type TeamCardRecord } from "@/components/share/TeamShareCard";
import type { StandingsBefore } from "@/lib/standings";
import { BeforeDayNote, useLevelStandings } from "./LevelStandings";
import { FormStrip, PointDiff, Streak } from "./TeamForm";

/**
 * Balance, puesto, racha, últimos 10, casa/fuera y diferencia de la cabecera del equipo según el nivel de
 * spoilers (Tarea 6.6), con la tarjeta para compartir del mismo nivel.
 */
export function TeamRecordStats({
  teamId,
  conference,
  before,
  card,
}: {
  teamId: number;
  /** "Este" / "Oeste". */
  conference: string | null;
  before: StandingsBefore;
  card: Omit<TeamCardData, "record" | "beforeDay">;
}) {
  const standings = useLevelStandings(before);
  const row = standings.teams?.find((t) => t.id === teamId) ?? null;
  const extra = row?.standings_extra ?? {};
  const form = extra.form ?? [];
  const record: TeamCardRecord | null = row && {
    wins: row.wins,
    losses: row.losses,
    confRank: row.conf_rank,
    streak: extra.streak ?? null,
    l10: extra.l10 ?? null,
    form,
    home: extra.home ?? null,
    road: extra.road ?? null,
    diff: extra.diff_ppg ?? null,
  };

  return (
    <>
      {row && (
        <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-5">
          <HeroStat label="Balance">
            {row.wins}-{row.losses}
          </HeroStat>
          {row.conf_rank && conference && (
            <HeroStat label="Posición">
              <Link href="/standings" className="hover:text-orange-300">
                {row.conf_rank}º <span className="text-xl text-white/75">{conference}</span>
              </Link>
            </HeroStat>
          )}
          <HeroStat label="Racha">
            <Streak streak={extra.streak} />
          </HeroStat>
          <HeroStat label={form.length < 10 ? `Últimos ${form.length}` : "Últimos 10"}>
            <span className="flex h-9 items-center gap-3">
              <FormStrip form={form} size="lg" />
              {extra.l10 && <span className="text-2xl">{extra.l10}</span>}
            </span>
          </HeroStat>
          <HeroStat label="Casa">{extra.home ?? "–"}</HeroStat>
          <HeroStat label="Fuera">{extra.road ?? "–"}</HeroStat>
          <HeroStat label="Dif. puntos">
            <PointDiff value={extra.diff_ppg} />
          </HeroStat>
        </dl>
      )}
      <BeforeDayNote standings={standings} day={before.day} subject="lo" className="mt-5 text-white/70" />
      <TeamCardExport
        team={{ ...card, record, beforeDay: standings.current ? null : before.day }}
        spoiler={standings.spoiler}
        className="mt-6"
      />
    </>
  );
}

function HeroStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-white/70">{label}</dt>
      <dd className="font-display text-4xl font-bold leading-tight text-white tabular-nums">{children}</dd>
    </div>
  );
}
