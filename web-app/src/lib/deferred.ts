// Modo diferido (Tarea 6.13): quien ve un partido grabado dice por dónde va y la ficha se rehace
// solo con lo ocurrido hasta ese instante, desde la jugada a jugada de la CDN. El boxscore final
// de la NBA solo aporta la plantilla (nombres, dorsales, titulares y bajas anunciadas antes del
// partido): ninguna cifra, marcador, estado ni número de periodos sale de él.
// Puro (sin red ni Next): lo usa el servidor (`getDeferredDetail`). La posición y sus pasos, en `deferred-position.ts`.
import type { BoxLine, GameDetail, PlayerLine, TeamBox } from "./game-detail.ts";
import { periodLength, positionLabel, type DeferredPosition } from "./deferred-position.ts";
import {
  absenceOf,
  elapsedAt,
  isoSeconds,
  longestRun,
  periodStart,
  playerMetrics,
  scanActions,
  sortActions,
  teamMetrics,
  type RawAction,
  type RawBoxscoreGame,
  type RawPlayer,
} from "./game-pbp.ts";

/** Segundos de juego transcurridos en esa posición. */
export function positionElapsed(position: DeferredPosition, regulation = 4): number {
  return periodStart(position.period, regulation) + periodLength(position.period, regulation) - position.remaining;
}

/**
 * ¿Había pasado ya la jugada en esa posición? Lo que ocurre con el reloj parado justo en ese
 * segundo aún no (el usuario puede no haberlo visto), salvo al final del periodo. Los cambios
 * hechos entre periodos se apuntan con el reloj entero: ya están hechos al empezar.
 */
export function happenedBy(action: RawAction, position: DeferredPosition, regulation = 4): boolean {
  if (action.period !== position.period) return action.period < position.period;
  if (position.remaining === 0) return true;
  const left = isoSeconds(action.clock);
  return left > position.remaining || (left >= periodLength(position.period, regulation) && action.actionType === "substitution");
}

// --- Boxscore rehecho jugada a jugada ---

type Side = "away" | "home";
const SIDES: Side[] = ["away", "home"];

type Tally = BoxLine & { seconds: number; plusMinus: number; foulsDrawn: number; played: boolean };

const emptyLine = (): BoxLine => ({
  pts: 0,
  reb: 0,
  oreb: 0,
  dreb: 0,
  ast: 0,
  stl: 0,
  blk: 0,
  tov: 0,
  pf: 0,
  fgm: 0,
  fga: 0,
  fg3m: 0,
  fg3a: 0,
  ftm: 0,
  fta: 0,
  paintPts: 0,
  fastBreakPts: 0,
  secondChancePts: 0,
});

const LINE_KEYS = Object.keys(emptyLine()) as (keyof BoxLine)[];

function sumLines(lines: BoxLine[]): BoxLine {
  const total = emptyLine();
  for (const line of lines) for (const key of LINE_KEYS) total[key] += line[key];
  return total;
}

/** Solo la línea de estadística (sin minutos ni +/-), para sumar el equipo. */
const pickLine = (tally: BoxLine): BoxLine => Object.fromEntries(LINE_KEYS.map((key) => [key, tally[key]])) as BoxLine;

/** Las bajas anunciadas antes del partido; el resto, "sin minutos" (aún no sabemos si jugará). */
function absenceAt(player: RawPlayer): { absence: string; detail: string | null } {
  if (player.status === "INACTIVE") {
    const { absence, detail } = absenceOf(player, false);
    return { absence: absence ?? "Inactivo", detail };
  }
  return { absence: "Sin minutos", detail: null };
}

/**
 * La ficha del partido tal y como estaba en `position`. Mismo formato que la ficha completa
 * (`GameDetail`) para que la pinten los mismos componentes, siempre "en juego" y con el eje del
 * marcador de 48 minutos salvo que el usuario haya entrado él mismo en una prórroga.
 */
export function buildDeferredDetail(game: RawBoxscoreGame, rawActions: RawAction[], position: DeferredPosition): GameDetail {
  const regulation = game.regulationPeriods ?? 4;
  // Sin "Final del partido": al final del 4.º cuarto delataría que no hay prórroga
  const actions = sortActions(rawActions).filter((a) => a.actionType !== "game" && happenedBy(a, position, regulation));
  const scan = scanActions(actions, regulation);

  // Minutos hasta el instante elegido; si va por delante de lo jugado, hasta donde llegue el partido
  const playedUntil =
    game.gameStatus === 3 ? periodStart(game.period + 1, regulation) : elapsedAt(game.period, game.gameClock, regulation);
  const until = Math.min(positionElapsed(position, regulation), playedUntil);

  const teams = { away: game.awayTeam, home: game.homeTeam };
  const sideOf = new Map<number, Side>([
    [game.awayTeam.teamId, "away"],
    [game.homeTeam.teamId, "home"],
  ]);
  const tallies = new Map<number, Tally>();
  const onCourt: Record<Side, Set<number>> = { away: new Set(), home: new Set() };
  for (const side of SIDES) {
    for (const p of teams[side].players ?? []) {
      const starter = p.starter === "1";
      tallies.set(p.personId, { ...emptyLine(), seconds: 0, plusMinus: 0, foulsDrawn: 0, played: starter });
      if (starter) onCourt[side].add(p.personId);
    }
  }

  const teamTurnovers: Record<Side, number> = { away: 0, home: 0 };
  const offTurnovers: Record<Side, number> = { away: 0, home: 0 };
  const periods: Record<Side, number[]> = {
    away: Array.from({ length: position.period }, () => 0),
    home: Array.from({ length: position.period }, () => 0),
  };
  const biggestLead: Record<Side, number> = { away: 0, home: 0 };
  const timeLeading: Record<Side, number> = { away: 0, home: 0 };
  let leadChanges = 0;
  let timesTied = 0;
  let lastLeader: Side | null = null;
  let score: Record<Side, number> = { away: 0, home: 0 };
  let clock = 0;
  // Los tiros libres cuentan en el +/- de los que estaban en pista al cometerse la falta (como la NBA),
  // aunque alguien entre o salga entre un tiro y otro
  let foulLineup: Record<Side, Set<number>> | null = null;

  // Reparte el tiempo desde la jugada anterior entre los que están en pista y quien va por delante
  const advance = (to: number) => {
    const t = Math.min(to, until);
    const dt = t - clock;
    if (dt <= 0) return;
    for (const side of SIDES) for (const id of onCourt[side]) tallies.get(id)!.seconds += dt;
    const leader = score.away > score.home ? "away" : score.home > score.away ? "home" : null;
    if (leader) timeLeading[leader] += dt;
    clock = t;
  };

  for (const action of actions) {
    advance(elapsedAt(action.period, action.clock, regulation));
    const side = action.teamId ? sideOf.get(action.teamId) : undefined;
    const tally = action.personId ? tallies.get(action.personId) : undefined;
    const qualifiers = action.qualifiers ?? [];
    const made = action.shotResult === "Made";
    if (tally && action.actionType !== "substitution") tally.played = true;

    switch (action.actionType) {
      case "substitution":
        if (side && action.personId) {
          if (action.subType === "in") {
            onCourt[side].add(action.personId);
            if (tally) tally.played = true;
          } else if (action.subType === "out") {
            onCourt[side].delete(action.personId);
          }
        }
        break;
      case "2pt":
      case "3pt": {
        foulLineup = null;
        const three = action.actionType === "3pt";
        if (tally) {
          tally.fga += 1;
          if (three) tally.fg3a += 1;
          if (made) {
            const points = three ? 3 : 2;
            tally.fgm += 1;
            if (three) tally.fg3m += 1;
            tally.pts += points;
            if (qualifiers.includes("pointsinthepaint")) tally.paintPts += points;
            if (qualifiers.includes("fastbreak")) tally.fastBreakPts += points;
            if (qualifiers.includes("2ndchance")) tally.secondChancePts += points;
          }
        }
        if (made && action.assistPersonId) {
          const assister = tallies.get(action.assistPersonId);
          if (assister) assister.ast += 1;
        }
        if (!made && action.blockPersonId) {
          const blocker = tallies.get(action.blockPersonId);
          if (blocker) blocker.blk += 1;
        }
        break;
      }
      case "freethrow":
        if (tally) {
          tally.fta += 1;
          if (made) {
            tally.ftm += 1;
            tally.pts += 1;
            if (qualifiers.includes("fastbreak")) tally.fastBreakPts += 1;
            if (qualifiers.includes("2ndchance")) tally.secondChancePts += 1;
          }
        }
        break;
      case "rebound":
        if (tally && !qualifiers.includes("team")) {
          tally.reb += 1;
          if (action.subType === "offensive") tally.oreb += 1;
          else tally.dreb += 1;
        }
        break;
      case "turnover":
        if (tally) tally.tov += 1;
        else if (side) teamTurnovers[side] += 1;
        if (action.stealPersonId) {
          const stealer = tallies.get(action.stealPersonId);
          if (stealer) stealer.stl += 1;
        }
        break;
      case "foul":
        foulLineup = { away: new Set(onCourt.away), home: new Set(onCourt.home) };
        if (tally && action.subType !== "technical") tally.pf += 1;
        if (action.foulDrawnPersonId) {
          const fouled = tallies.get(action.foulDrawnPersonId);
          if (fouled) fouled.foulsDrawn += 1;
        }
        break;
    }

    // Marcador: parciales, +/- de los que están en pista y quién manda
    const next = { away: Number(action.scoreAway) || score.away, home: Number(action.scoreHome) || score.home };
    if (next.away === score.away && next.home === score.home) continue;
    const lineup = action.actionType === "freethrow" && foulLineup ? foulLineup : onCourt;
    for (const s of SIDES) {
      const diff = next[s] - score[s];
      if (diff <= 0) continue;
      const index = Math.min(action.period, position.period) - 1;
      periods[s][index] += diff;
      if (qualifiers.includes("fromturnover")) offTurnovers[s] += diff;
      const rival = s === "away" ? "home" : "away";
      for (const id of lineup[s]) tallies.get(id)!.plusMinus += diff;
      for (const id of lineup[rival]) tallies.get(id)!.plusMinus -= diff;
    }
    const leader = next.away > next.home ? "away" : next.home > next.away ? "home" : null;
    if (!leader && score.away !== score.home) timesTied += 1;
    if (leader && lastLeader && leader !== lastLeader) leadChanges += 1;
    if (leader) lastLeader = leader;
    biggestLead.away = Math.max(biggestLead.away, next.away - next.home);
    biggestLead.home = Math.max(biggestLead.home, next.home - next.away);
    score = next;
  }
  advance(until);

  // Líneas de equipo (las dos antes de las métricas, que comparan con el rival)
  const rosters = { away: teams.away.players ?? [], home: teams.home.players ?? [] };
  const lines = {} as Record<Side, BoxLine>;
  const teamSeconds = {} as Record<Side, number>;
  for (const side of SIDES) {
    const own = rosters[side].map((p) => tallies.get(p.personId)!);
    const sum = sumLines(own.map(pickLine));
    lines[side] = { ...sum, tov: sum.tov + teamTurnovers[side] };
    teamSeconds[side] = own.reduce((total, t) => total + t.seconds, 0);
  }

  const teamBox = (side: Side): TeamBox => {
    const raw = teams[side];
    const rival = side === "away" ? "home" : "away";
    const players = rosters[side].map((p): PlayerLine => {
      const tally = tallies.get(p.personId)!;
      const line = pickLine(tally);
      const played = tally.played || tally.seconds > 0;
      const { absence, detail } = played ? { absence: null, detail: null } : absenceAt(p);
      return {
        ...line,
        id: p.personId,
        name: p.name,
        short: p.nameI,
        jersey: p.jerseyNum || null,
        position: p.position || null,
        starter: p.starter === "1",
        onCourt: onCourt[side].has(p.personId),
        played,
        absence,
        absenceDetail: detail,
        seconds: tally.seconds,
        plusMinus: tally.plusMinus,
        foulsDrawn: tally.foulsDrawn,
        ...playerMetrics(line, tally.seconds, lines[side], teamSeconds[side]),
      };
    });
    // El orden de la NBA sigue los minutos del partido entero: el banquillo, por minutos hasta aquí
    const rank = (p: PlayerLine) => (p.starter ? 0 : p.played ? 1 : 2);
    players.sort(
      (a, b) => rank(a) - rank(b) || (rank(a) === 1 ? b.seconds - a.seconds : rank(a) === 2 ? a.name.localeCompare(b.name, "es") : 0)
    );

    return {
      id: raw.teamId,
      tricode: raw.teamTricode,
      name: `${raw.teamCity} ${raw.teamName}`,
      score: score[side],
      periods: periods[side],
      timeoutsRemaining: null,
      inBonus: false,
      run: longestRun(scan.streaks, side),
      players,
      totals: {
        ...lines[side],
        pointsOffTurnovers: offTurnovers[side],
        benchPts: players.filter((p) => !p.starter).reduce((total, p) => total + p.pts, 0),
        biggestLead: biggestLead[side],
        timeLeadingS: timeLeading[side],
        ...teamMetrics(lines[side], lines[rival]),
      },
    };
  };

  const away = teamBox("away");
  const home = teamBox("home");

  return {
    id: game.gameId,
    status: "Live",
    periodText: positionLabel(position, regulation),
    period: position.period,
    regulationPeriods: regulation,
    arena: game.arena?.arenaName || null,
    city: game.arena?.arenaCity || null,
    attendance: game.attendance || null,
    sellout: game.sellout === "1",
    durationMin: null,
    officials: (game.officials ?? []).map((o) => o.name),
    pace: teamSeconds.away > 0 ? (away.totals.possessions * 5 * 48 * 60) / teamSeconds.away : null,
    leadChanges,
    timesTied,
    away,
    home,
    flow: scan.flow,
    elapsed: until,
    length: periodStart(Math.max(position.period, regulation) + 1, regulation),
    shots: scan.shots,
    plays: scan.plays,
    fetchedAt: new Date().toISOString(),
  };
}
