import { createHash } from "crypto";
import { AlertItem, buildLiveAlerts, LiveAlertMatch, snapshotFromMatches } from "./alerts";
import { getFixtureById, getMatchOdds, getMatchStatistics } from "./football-api";
import { translateLeague, translateTeam } from "./league-translations";

type ApiStatItem = { type: string; value: number | string | null };
type ApiTeamStats = { statistics?: ApiStatItem[] };
type ApiBet = {
  name: string;
  values?: Array<{ value: string; odd?: string }>;
};

type FixtureResponseItem = {
  fixture?: {
    id?: number;
    date?: string | null;
    status?: { short?: string | null; elapsed?: number | null };
  };
  league?: { name?: string | null; round?: string | null };
  teams?: { home?: { name?: string | null }; away?: { name?: string | null } };
  goals?: { home?: number | null; away?: number | null };
  coverage?: { providerMatchId?: string | null };
};

type MatchSnapshot = ReturnType<typeof snapshotFromMatches>[string];

export type MonitoredMatchRow = {
  id: string;
  user_id: string;
  fixture_id: string;
  league: string | null;
  home_team: string | null;
  away_team: string | null;
  kickoff_at: string | null;
  status: string | null;
  last_snapshot: unknown;
};

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function statusFromShort(short?: string | null): LiveAlertMatch["status"] {
  if (["1H", "2H", "ET", "BT", "HT"].includes(short ?? "")) return "live";
  if (["FT", "AET", "PEN", "PST", "CANC", "ABD", "AWD", "WO"].includes(short ?? "")) {
    return "finished";
  }
  return "upcoming";
}

function statValue(items: ApiStatItem[] | undefined, type: string) {
  const item = items?.find((stat) => stat.type === type);
  if (!item) return undefined;
  const raw =
    typeof item.value === "string" ? Number(item.value.replace("%", "")) : item.value;
  return optionalNumber(raw);
}

function oddValue(bets: ApiBet[] | undefined, name: string) {
  const winner = bets?.find((bet) => bet.name === "Match Winner");
  const value = Number(winner?.values?.find((item) => item.value === name)?.odd);
  return Number.isFinite(value) && value > 1 ? value : undefined;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildUpsetSignal(match: LiveAlertMatch) {
  const { homeWinOdds, drawOdds, awayWinOdds } = match;
  if (!homeWinOdds || !awayWinOdds || homeWinOdds <= 1 || awayWinOdds <= 1) return {};

  const oddsGap = Math.abs(homeWinOdds - awayWinOdds);
  if (oddsGap < 0.35) return {};

  const homeIsFavorite = homeWinOdds < awayWinOdds;
  const underdogOdd = homeIsFavorite ? awayWinOdds : homeWinOdds;
  const favoriteScore = homeIsFavorite ? match.homeScore : match.awayScore;
  const underdogScore = homeIsFavorite ? match.awayScore : match.homeScore;
  const impliedTotal =
    1 / homeWinOdds + (drawOdds && drawOdds > 1 ? 1 / drawOdds : 0) + 1 / awayWinOdds;
  const baseProbability = impliedTotal > 0 ? (1 / underdogOdd / impliedTotal) * 100 : 0;
  const scoreGap = underdogScore - favoriteScore;
  const minute = match.minute ?? 0;
  const scoreBoost = scoreGap > 0 ? 28 + scoreGap * 14 : scoreGap === 0 ? 6 : -10;
  const lateBoost = scoreGap >= 0 ? clamp(((minute - 45) / 45) * 16, 0, 16) : 0;
  const upsetProbability = clamp(baseProbability + scoreBoost + lateBoost, 0, 95);

  return {
    upsetProbability: Math.round(upsetProbability * 10) / 10,
    upsetSide: homeIsFavorite
      ? `${translateTeam(match.awayTeam)} 爆冷方向`
      : `${translateTeam(match.homeTeam)} 爆冷方向`,
  };
}

function stableAlertKey(userId: string, alert: AlertItem) {
  const digest = createHash("sha1")
    .update([userId, alert.match_id, alert.type, alert.score, alert.content].join("|"))
    .digest("hex")
    .slice(0, 20);
  return `${alert.type}:${alert.match_id}:${digest}`;
}

function normalizePreviousSnapshot(value: unknown, fixtureId: string) {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Record<string, MatchSnapshot>;
  if (snapshot[fixtureId]) return snapshot;
  if ("id" in snapshot) return { [fixtureId]: snapshot as unknown as MatchSnapshot };
  return null;
}

export async function buildServerAlertMatch(fixtureId: string | number) {
  const [fixtureRes, statsRes, oddsRes] = await Promise.allSettled([
    getFixtureById(fixtureId),
    getMatchStatistics(fixtureId),
    getMatchOdds(fixtureId),
  ]);

  if (fixtureRes.status !== "fulfilled") throw fixtureRes.reason;

  const fixture = ((fixtureRes.value as { response?: FixtureResponseItem[] }).response ?? [])[0];
  if (!fixture) throw new Error("没有读取到监控比赛");

  const homeStats =
    statsRes.status === "fulfilled"
      ? ((statsRes.value as { response?: ApiTeamStats[] }).response ?? [])[0]?.statistics
      : undefined;
  const awayStats =
    statsRes.status === "fulfilled"
      ? ((statsRes.value as { response?: ApiTeamStats[] }).response ?? [])[1]?.statistics
      : undefined;
  const bets =
    oddsRes.status === "fulfilled"
      ? (oddsRes.value as { response?: Array<{ bookmakers?: Array<{ bets?: ApiBet[] }> }> })
          .response?.[0]?.bookmakers?.[0]?.bets
      : undefined;

  const match: LiveAlertMatch = {
    id: fixture.coverage?.providerMatchId ?? fixture.fixture?.id ?? fixtureId,
    league: translateLeague(`${fixture.league?.name ?? ""} ${fixture.league?.round ?? ""}`.trim()),
    homeTeam: translateTeam(fixture.teams?.home?.name ?? "主队"),
    awayTeam: translateTeam(fixture.teams?.away?.name ?? "客队"),
    homeScore: safeNumber(fixture.goals?.home),
    awayScore: safeNumber(fixture.goals?.away),
    status: statusFromShort(fixture.fixture?.status?.short),
    minute: optionalNumber(fixture.fixture?.status?.elapsed),
    yellowCardsHome: statValue(homeStats, "Yellow Cards"),
    yellowCardsAway: statValue(awayStats, "Yellow Cards"),
    redCardsHome: statValue(homeStats, "Red Cards"),
    redCardsAway: statValue(awayStats, "Red Cards"),
    cornersHome: statValue(homeStats, "Corner Kicks"),
    cornersAway: statValue(awayStats, "Corner Kicks"),
    homeWinOdds: oddValue(bets, "Home"),
    drawOdds: oddValue(bets, "Draw"),
    awayWinOdds: oddValue(bets, "Away"),
  };

  return {
    ...match,
    ...buildUpsetSignal(match),
  };
}

export function buildServerAlertsForRow(row: MonitoredMatchRow, match: LiveAlertMatch) {
  const current = snapshotFromMatches([match]);
  const fixtureId = String(match.id);
  const previous = normalizePreviousSnapshot(row.last_snapshot, fixtureId);
  const alerts = previous ? buildLiveAlerts(previous, current) : buildLiveAlerts({}, current);
  const old = previous?.[fixtureId];

  if (old && old.status !== "finished" && match.status === "finished") {
    alerts.push({
      id: `finished-${fixtureId}-${Date.now()}`,
      match_id: fixtureId,
      match_name: `${match.homeTeam} vs ${match.awayTeam}`,
      score: `${match.homeScore} : ${match.awayScore}`,
      type: "ai_update",
      content: "比赛已经结束，系统停止实时监控；如本场使用过预测积分，结果会进入历史预测等待结算。",
      created_at: new Date().toISOString(),
      read: false,
      source: "server",
    });
  }

  return alerts.map((alert) => ({
    ...alert,
    source: "server" as const,
    alertKey: stableAlertKey(row.user_id, alert),
    snapshot: current[fixtureId] ?? current[String(row.fixture_id)] ?? {},
  }));
}

export function snapshotForMatch(match: LiveAlertMatch) {
  return snapshotFromMatches([match]);
}

