import {
  calculateFootballPrediction,
  MatchAnalysisData,
  PredictionResult,
  UserPreferences,
} from "./football-prediction";
import {
  getFixtureById,
  getMatchOdds,
  getMatchStatistics,
  getTeamRecentForm,
} from "./football-api";
import { PREDICTION_CREDITS_PER_MATCH } from "./membership";
import {
  PREDICTION_MODEL_VERSION,
  PredictionOrderInput,
  PredictionOrderItemInput,
} from "./prediction-orders";
import { fetchTheStatsJson, theStatsConfigStatus } from "./thestats-api";
import { translateLeague, translateTeam } from "./league-translations";

type FixtureId = string | number;
type MatchStatus = "live" | "upcoming" | "finished";

type BuiltMatch = {
  fixtureId: FixtureId;
  provider: "thestats" | "legacy";
  matchData: MatchAnalysisData;
  status: MatchStatus;
  kickoffAt: string | null;
  prediction: PredictionResult;
  dataBasis: string[];
  marketContext?: string[];
};

type BuildParams = {
  fixtureIds: FixtureId[];
  prefs: UserPreferences;
  riskLevel?: string;
  summary?: string;
  preferencesSnapshot?: Record<string, unknown>;
  portfolioSnapshot?: Record<string, unknown>;
};

type LegacyFixture = {
  fixture?: {
    id?: number;
    date?: string;
    status?: { short?: string; elapsed?: number | null };
  };
  league?: { id?: number; name?: string; round?: string | null };
  teams?: {
    home?: { id?: number; name?: string };
    away?: { id?: number; name?: string };
  };
  goals?: { home?: number | null; away?: number | null };
};

type LegacyStatItem = { type?: string; value?: number | string | null };
type LegacyTeamStats = {
  team?: { id?: number };
  statistics?: LegacyStatItem[];
};

type LegacyBet = {
  name?: string;
  values?: Array<{ value?: string; odd?: string | number | null }>;
};

type TheStatsMatch = {
  id?: string;
  competition_name?: string | null;
  season_id?: string | null;
  matchday?: number | null;
  stage_name?: string | null;
  status?: "scheduled" | "live" | "finished" | "postponed" | "cancelled" | string;
  utc_date?: string | null;
  home_team?: { id?: string; name?: string };
  away_team?: { id?: string; name?: string };
  score?: { home?: number | null; away?: number | null };
  live_odds_available?: boolean;
};

type TheStatsMetric = {
  all?: { home?: number | null; away?: number | null };
};

type TheStatsStats = {
  overview?: {
    ball_possession?: TheStatsMetric;
    expected_goals?: TheStatsMetric;
    total_shots?: TheStatsMetric;
    shots_on_target?: TheStatsMetric;
    corner_kicks?: TheStatsMetric;
  };
};

type TheStatsOddsValue = {
  opening?: string | number | null;
  last_seen?: string | number | null;
  live?: string | number | null;
};

type TheStatsOdds = {
  bookmakers?: Array<{
    bookmaker?: string;
    markets?: {
      match_odds?: {
        home?: TheStatsOddsValue;
        draw?: TheStatsOddsValue;
        away?: TheStatsOddsValue;
      };
      total_goals?: Record<
        string,
        { over?: TheStatsOddsValue; under?: TheStatsOddsValue }
      >;
      asian_handicap?: {
        home?: Record<string, TheStatsOddsValue>;
        away?: Record<string, TheStatsOddsValue>;
      };
    };
  }>;
};

type TheStatsTeamStats = {
  form?: string | null;
};

type TheStatsBookmaker = NonNullable<TheStatsOdds["bookmakers"]>[number];
type TheStatsMarkets = NonNullable<TheStatsBookmaker["markets"]>;

const emptyOdds: MatchAnalysisData["odds"] = {
  homeWin: 0,
  draw: 0,
  awayWin: 0,
  handicap: "暂无",
  overUnder: "暂无",
};

const neutralStats = {
  possessionHome: 50,
  possessionAway: 50,
  shotsHome: 0,
  shotsAway: 0,
  shotsOnTargetHome: 0,
  shotsOnTargetAway: 0,
  cornersHome: 0,
  cornersAway: 0,
  xGHome: 0,
  xGAway: 0,
};

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function uniqueFixtureIds(ids: FixtureId[]) {
  const seen = new Set<string>();
  return ids
    .map((id) => String(id).trim())
    .filter(Boolean)
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

export function isTheStatsFixtureId(id: FixtureId) {
  const value = String(id);
  return value.startsWith("mt_") || (theStatsConfigStatus().configured && /^\d+$/.test(value));
}

function normalizeTheStatsMatchId(id: FixtureId) {
  const value = String(id);
  return value.startsWith("mt_") ? value : `mt_${value.padStart(9, "0")}`;
}

function statusFromLegacy(short?: string): MatchStatus {
  if (["1H", "2H", "ET", "BT"].includes(short ?? "")) return "live";
  if (["FT", "AET", "PEN", "PST", "CANC", "ABD", "AWD", "WO"].includes(short ?? ""))
    return "finished";
  return "upcoming";
}

function statusFromTheStats(status?: string): MatchStatus {
  if (status === "live") return "live";
  if (status === "finished") return "finished";
  return "upcoming";
}

function statValue(items: LegacyStatItem[] | undefined, type: string) {
  const item = items?.find((stat) => stat.type === type);
  if (!item) return 0;
  const raw =
    typeof item.value === "string" ? Number(item.value.replace("%", "")) : item.value;
  return safeNumber(raw);
}

function mapLegacyStats(teams?: LegacyTeamStats[]) {
  if (!teams || teams.length < 2) return neutralStats;
  const home = teams[0].statistics;
  const away = teams[1].statistics;

  return {
    possessionHome: statValue(home, "Ball Possession") || 50,
    possessionAway: statValue(away, "Ball Possession") || 50,
    shotsHome: statValue(home, "Total Shots"),
    shotsAway: statValue(away, "Total Shots"),
    shotsOnTargetHome: statValue(home, "Shots on Target"),
    shotsOnTargetAway: statValue(away, "Shots on Target"),
    cornersHome: statValue(home, "Corner Kicks"),
    cornersAway: statValue(away, "Corner Kicks"),
    xGHome: statValue(home, "Expected Goals"),
    xGAway: statValue(away, "Expected Goals"),
  };
}

function oddValue(value: unknown) {
  const parsed = safeNumber(value);
  return parsed > 1 ? parsed : 0;
}

function mapLegacyOdds(bets?: LegacyBet[] | null): MatchAnalysisData["odds"] {
  if (!bets) return emptyOdds;

  const winner = bets.find((bet) => bet.name === "Match Winner");
  const overUnder = bets.find((bet) => bet.name === "Goals Over/Under");
  const handicap = bets.find((bet) => bet.name === "Asian Handicap");
  const value = (name: string) =>
    oddValue(winner?.values?.find((item) => item.value === name)?.odd);

  const homeWin = value("Home");
  const draw = value("Draw");
  const awayWin = value("Away");
  if (!homeWin || !draw || !awayWin) return emptyOdds;

  return {
    homeWin,
    draw,
    awayWin,
    handicap: handicap?.values?.[0]?.value ?? "暂无",
    overUnder: overUnder?.values?.[0]?.value ?? "暂无",
  };
}

function mapLegacyForm(raw: unknown, teamId?: number | null) {
  const fixtures = (raw as { response?: LegacyFixture[] } | null)?.response ?? [];
  if (!fixtures.length || !teamId) return "";

  return fixtures
    .slice(0, 10)
    .map((fixture) => {
      const isHome = fixture.teams?.home?.id === teamId;
      const gf = isHome ? fixture.goals?.home ?? 0 : fixture.goals?.away ?? 0;
      const ga = isHome ? fixture.goals?.away ?? 0 : fixture.goals?.home ?? 0;
      if (gf > ga) return "W";
      if (gf < ga) return "L";
      return "D";
    })
    .join("-");
}

function metricPair(stats: TheStatsStats | null, key: keyof NonNullable<TheStatsStats["overview"]>) {
  const metric = stats?.overview?.[key]?.all;
  return {
    home: safeNumber(metric?.home),
    away: safeNumber(metric?.away),
  };
}

function latestOdd(value?: TheStatsOddsValue) {
  return oddValue(value?.live ?? value?.last_seen ?? value?.opening);
}

function oddAt(value: TheStatsOddsValue | undefined, key: "opening" | "last_seen" | "live") {
  return oddValue(value?.[key]);
}

function chooseBookmaker(odds: TheStatsOdds | null) {
  const bookmakers = odds?.bookmakers ?? [];
  const priority = ["Pinnacle", "Bet365", "Betfair Exchange", "Kambi"];
  return (
    priority
      .map((name) => bookmakers.find((bookmaker) => bookmaker.bookmaker === name))
      .find(Boolean) ?? bookmakers[0]
  );
}

function chooseTotalGoalsLine(totalGoals?: TheStatsMarkets["total_goals"]) {
  const keys = Object.keys(totalGoals ?? {});
  if (keys.length === 0) return "暂无";
  return keys.sort((a, b) => Math.abs(Number(a) - 2.5) - Math.abs(Number(b) - 2.5))[0];
}

function chooseHandicapLine(handicap?: TheStatsMarkets["asian_handicap"]) {
  const homeLines = Object.keys(handicap?.home ?? {});
  if (homeLines.length === 0) return "暂无";
  return `主队 ${homeLines.sort((a, b) => Math.abs(Number(a)) - Math.abs(Number(b)))[0]}`;
}

function mapTheStatsOdds(odds: TheStatsOdds | null): MatchAnalysisData["odds"] {
  const bookmaker = chooseBookmaker(odds);
  const markets = bookmaker?.markets;
  const matchOdds = markets?.match_odds;
  const homeWin = latestOdd(matchOdds?.home);
  const draw = latestOdd(matchOdds?.draw);
  const awayWin = latestOdd(matchOdds?.away);

  if (!homeWin || !draw || !awayWin) return emptyOdds;

  return {
    homeWin,
    draw,
    awayWin,
    handicap: chooseHandicapLine(markets?.asian_handicap),
    overUnder: chooseTotalGoalsLine(markets?.total_goals),
  };
}

function noVigSnapshot(
  matchOdds: TheStatsMarkets["match_odds"] | undefined,
  key: "opening" | "last_seen" | "live"
) {
  const home = oddAt(matchOdds?.home, key);
  const draw = oddAt(matchOdds?.draw, key);
  const away = oddAt(matchOdds?.away, key);
  if (!home || !draw || !away) return null;

  const raw = {
    homeWin: 1 / home,
    draw: 1 / draw,
    awayWin: 1 / away,
  };
  const total = raw.homeWin + raw.draw + raw.awayWin;
  if (!Number.isFinite(total) || total <= 0) return null;

  return {
    overround: Math.round((total - 1) * 1000) / 10,
    noVig: {
      homeWin: Math.round((raw.homeWin / total) * 1000) / 10,
      draw: Math.round((raw.draw / total) * 1000) / 10,
      awayWin: Math.round((raw.awayWin / total) * 1000) / 10,
    },
  };
}

function buildMarketContext(odds: TheStatsOdds | null) {
  const bookmaker = chooseBookmaker(odds);
  const matchOdds = bookmaker?.markets?.match_odds;
  const latest = noVigSnapshot(matchOdds, "live") ?? noVigSnapshot(matchOdds, "last_seen");
  const opening = noVigSnapshot(matchOdds, "opening");
  if (!bookmaker || !latest) return [];

  const context = [`盘口源 ${bookmaker.bookmaker ?? "TheStats"}`];
  context.push(`抽水 ${latest.overround}%`);

  if (opening) {
    const shifts = [
      { label: "主胜", value: latest.noVig.homeWin - opening.noVig.homeWin },
      { label: "平局", value: latest.noVig.draw - opening.noVig.draw },
      { label: "客胜", value: latest.noVig.awayWin - opening.noVig.awayWin },
    ].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    const strongest = shifts[0];
    if (strongest && Math.abs(strongest.value) >= 0.8) {
      context.push(
        `${strongest.label}方向${strongest.value > 0 ? "升温" : "降温"} ${
          strongest.value > 0 ? "+" : ""
        }${(Math.round(strongest.value * 10) / 10).toFixed(1)}%`
      );
    } else {
      context.push("盘口整体平稳");
    }
  }

  return context;
}

function mapSignalMarket(signal: PredictionResult["valueSignals"][number]) {
  if (signal.market === "homeWin" || signal.market === "draw" || signal.market === "awayWin") {
    return "胜平负";
  }
  return "模型方向";
}

function riskLabel(score: number, confidence: number, edge: number | null) {
  if (edge == null || edge < 2 || confidence < 50) return "高";
  if (score >= 78 && confidence >= 65 && edge >= 6) return "低";
  return "中";
}

function gradeFromScore(score: number) {
  if (score >= 82) return "A";
  if (score >= 72) return "B";
  if (score >= 62) return "C";
  return "观察";
}

function buildOrderItem(match: BuiltMatch): PredictionOrderItemInput {
  const top = match.prediction.valueSignals[0];
  const edge = top.edge ?? null;
  const hasMarket = top.offeredOdds != null;
  const score = Math.round(
    clamp(
      match.prediction.confidence * 0.72 +
        Math.max(edge ?? 0, 0) * 1.8 +
        (hasMarket ? 8 : -10),
      0,
      100
    )
  );
  const selected = hasMarket && edge != null && edge >= 4 && match.prediction.confidence >= 54 && score >= 64;

  return {
    fixtureId: match.fixtureId,
    league: match.matchData.league,
    homeTeam: match.matchData.homeTeam,
    awayTeam: match.matchData.awayTeam,
    kickoffAt: match.kickoffAt,
    statusAtPrediction: match.status,
    market: mapSignalMarket(top),
    direction: top.label,
    recommendation: selected ? "selected" : "observe",
    confidence: Math.round(match.prediction.confidence),
    score,
    grade: gradeFromScore(score),
    riskLabel: riskLabel(score, match.prediction.confidence, edge),
    suggestedPercent: 0,
    fairOdds: top.fairOdds,
    offeredOdds: top.offeredOdds,
    valueEdge: edge,
    oddsLabel: top.offeredOdds
      ? `市场 ${top.offeredOdds.toFixed(2)} / 公平 ${top.fairOdds.toFixed(2)}`
      : `公平 ${top.fairOdds.toFixed(2)} / 待市场`,
    valueLabel: edge == null ? "等待市场指数" : `价值差 ${edge > 0 ? "+" : ""}${edge.toFixed(1)}%`,
    reason: selected
      ? "服务端读取最新比赛、市场指数和模型结果后生成，信号达到当前风险偏好门槛。"
      : "服务端已完成计算，但当前信号强度或市场指数不足，建议先观察。",
    dataBasis: match.dataBasis,
  };
}

function allocateSuggestedPercent(items: PredictionOrderItemInput[]) {
  const selected = items.filter((item) => item.recommendation === "selected");
  if (selected.length === 0) return items;

  const totalScore = selected.reduce((sum, item) => sum + Math.max(item.score, 1), 0);
  return items.map((item) => {
    if (item.recommendation !== "selected") return item;
    return {
      ...item,
      suggestedPercent: Math.round((Math.max(item.score, 1) / totalScore) * 1000) / 10,
    };
  });
}

async function fetchLegacyMatch(fixtureId: string): Promise<BuiltMatch> {
  const numericFixtureId = Number(fixtureId);
  if (!Number.isFinite(numericFixtureId) || numericFixtureId <= 0) {
    throw new Error("无效的比赛 ID");
  }

  const [fixtureRes, statsRes, oddsRes] = await Promise.allSettled([
    getFixtureById(numericFixtureId),
    getMatchStatistics(numericFixtureId),
    getMatchOdds(numericFixtureId),
  ]);

  if (fixtureRes.status !== "fulfilled") throw fixtureRes.reason;
  const fixture = ((fixtureRes.value as { response?: LegacyFixture[] }).response ?? [])[0];
  if (!fixture) throw new Error("没有读取到比赛基础信息");

  const stats =
    statsRes.status === "fulfilled"
      ? mapLegacyStats((statsRes.value as { response?: LegacyTeamStats[] }).response)
      : neutralStats;
  const bets =
    oddsRes.status === "fulfilled"
      ? (oddsRes.value as { response?: Array<{ bookmakers?: Array<{ bets?: LegacyBet[] }> }> })
          .response?.[0]?.bookmakers?.[0]?.bets
      : null;
  const odds = mapLegacyOdds(bets);

  const homeTeamId = fixture.teams?.home?.id ?? null;
  const awayTeamId = fixture.teams?.away?.id ?? null;
  const [homeFormRes, awayFormRes] = await Promise.allSettled([
    homeTeamId ? getTeamRecentForm(homeTeamId) : Promise.resolve(null),
    awayTeamId ? getTeamRecentForm(awayTeamId) : Promise.resolve(null),
  ]);

  const matchData: MatchAnalysisData = {
    homeTeam: translateTeam(fixture.teams?.home?.name ?? "主队"),
    awayTeam: translateTeam(fixture.teams?.away?.name ?? "客队"),
    league: translateLeague(`${fixture.league?.name ?? "未知联赛"} ${fixture.league?.round ?? ""}`.trim()),
    homeForm: homeFormRes.status === "fulfilled" ? mapLegacyForm(homeFormRes.value, homeTeamId) : "",
    awayForm: awayFormRes.status === "fulfilled" ? mapLegacyForm(awayFormRes.value, awayTeamId) : "",
    homeStats: {
      possession: stats.possessionHome,
      shots: stats.shotsHome,
      shotsOnTarget: stats.shotsOnTargetHome,
      xG: stats.xGHome,
      corners: stats.cornersHome,
    },
    awayStats: {
      possession: stats.possessionAway,
      shots: stats.shotsAway,
      shotsOnTarget: stats.shotsOnTargetAway,
      xG: stats.xGAway,
      corners: stats.cornersAway,
    },
    odds,
  };

  return {
    fixtureId,
    provider: "legacy",
    matchData,
    status: statusFromLegacy(fixture.fixture?.status?.short),
    kickoffAt: fixture.fixture?.date ?? null,
    prediction: calculateFootballPrediction(matchData, {
      risk_level: "balanced",
      capital: 1000,
      preferred_markets: [],
      preferred_models: [],
    }),
    dataBasis: [
      "legacy fixture",
      statsRes.status === "fulfilled" ? "legacy stats" : "stats unavailable",
      oddsRes.status === "fulfilled" ? "legacy odds" : "odds unavailable",
    ],
  };
}

async function fetchTheStatsTeamForm(teamId?: string, seasonId?: string | null) {
  if (!teamId || !seasonId) return "";
  try {
    const payload = await fetchTheStatsJson<{ data?: TheStatsTeamStats }>({
      path: `/football/teams/${teamId}/stats`,
      query: { season_id: seasonId },
      revalidate: 900,
    });
    return payload.data?.form ?? "";
  } catch {
    return "";
  }
}

async function fetchTheStatsMatch(fixtureId: string): Promise<BuiltMatch> {
  if (!theStatsConfigStatus().configured) {
    throw new Error("THESTATS_API_KEY 未配置，无法读取 TheStats 实盘数据");
  }

  const matchId = normalizeTheStatsMatchId(fixtureId);
  const matchPayload = await fetchTheStatsJson<{ data?: TheStatsMatch }>({
    path: `/football/matches/${matchId}`,
    revalidate: 120,
  });
  const match = matchPayload.data;
  if (!match) throw new Error("TheStats 没有返回比赛基础信息");

  const [statsRes, oddsRes, liveOddsRes, homeFormRes, awayFormRes] = await Promise.allSettled([
    fetchTheStatsJson<{ data?: TheStatsStats }>({
      path: `/football/matches/${matchId}/stats`,
      revalidate: 120,
    }),
    fetchTheStatsJson<{ data?: TheStatsOdds }>({
      path: `/football/matches/${matchId}/odds`,
      revalidate: 300,
    }),
    match.live_odds_available
      ? fetchTheStatsJson<{ data?: TheStatsOdds }>({
          path: `/football/matches/${matchId}/odds/live`,
          revalidate: 30,
        })
      : Promise.resolve(null),
    fetchTheStatsTeamForm(match.home_team?.id, match.season_id),
    fetchTheStatsTeamForm(match.away_team?.id, match.season_id),
  ]);

  const stats = statsRes.status === "fulfilled" ? statsRes.value.data ?? null : null;
  const liveOdds =
    liveOddsRes.status === "fulfilled" && liveOddsRes.value
      ? liveOddsRes.value.data ?? null
      : null;
  const preOdds = oddsRes.status === "fulfilled" ? oddsRes.value.data ?? null : null;
  const odds = mapTheStatsOdds(liveOdds ?? preOdds);
  const marketContext = buildMarketContext(liveOdds ?? preOdds);
  const possession = metricPair(stats, "ball_possession");
  const xg = metricPair(stats, "expected_goals");
  const shots = metricPair(stats, "total_shots");
  const shotsOnTarget = metricPair(stats, "shots_on_target");
  const corners = metricPair(stats, "corner_kicks");

  const matchData: MatchAnalysisData = {
    homeTeam: translateTeam(match.home_team?.name ?? "主队"),
    awayTeam: translateTeam(match.away_team?.name ?? "客队"),
    league: translateLeague(
      `${match.competition_name ?? "未知联赛"} ${match.matchday ? `第 ${match.matchday} 轮` : ""}`.trim()
    ),
    homeForm: homeFormRes.status === "fulfilled" ? homeFormRes.value : "",
    awayForm: awayFormRes.status === "fulfilled" ? awayFormRes.value : "",
    homeStats: {
      possession: possession.home || 50,
      shots: shots.home,
      shotsOnTarget: shotsOnTarget.home,
      xG: xg.home,
      corners: corners.home,
    },
    awayStats: {
      possession: possession.away || 50,
      shots: shots.away,
      shotsOnTarget: shotsOnTarget.away,
      xG: xg.away,
      corners: corners.away,
    },
    odds,
  };

  return {
    fixtureId: match.id ?? matchId,
    provider: "thestats",
    matchData,
    status: statusFromTheStats(match.status),
    kickoffAt: match.utc_date ?? null,
    prediction: calculateFootballPrediction(matchData, {
      risk_level: "balanced",
      capital: 1000,
      preferred_markets: [],
      preferred_models: [],
    }),
    dataBasis: [
      "TheStats match",
      statsRes.status === "fulfilled" ? "TheStats stats/xG" : "stats unavailable",
      liveOdds ? "TheStats live odds" : oddsRes.status === "fulfilled" ? "TheStats odds" : "odds unavailable",
      ...marketContext,
      homeFormRes.status === "fulfilled" || awayFormRes.status === "fulfilled"
        ? "team form"
        : "team form unavailable",
    ],
    marketContext,
  };
}

export async function fetchPredictionMatch(fixtureId: FixtureId, prefs: UserPreferences) {
  const id = String(fixtureId);
  let built: BuiltMatch;
  if (isTheStatsFixtureId(id)) {
    try {
      built = await fetchTheStatsMatch(id);
    } catch (error) {
      if (id.startsWith("mt_")) throw error;
      built = await fetchLegacyMatch(id);
    }
  } else {
    built = await fetchLegacyMatch(id);
  }
  return {
    ...built,
    prediction: calculateFootballPrediction(built.matchData, prefs),
  };
}

export async function buildServerPredictionOrderInput({
  fixtureIds,
  prefs,
  riskLevel,
  summary,
  preferencesSnapshot,
  portfolioSnapshot,
}: BuildParams): Promise<PredictionOrderInput & { builtMatches: BuiltMatch[] }> {
  const ids = uniqueFixtureIds(fixtureIds).slice(0, 20);
  if (ids.length === 0) throw new Error("请先把比赛加入预测池");

  const builtMatches = await Promise.all(ids.map((id) => fetchPredictionMatch(id, prefs)));
  const rawItems = builtMatches.map(buildOrderItem);
  const items = allocateSuggestedPercent(rawItems);
  const selectedCount = items.filter((item) => item.recommendation === "selected").length;
  const totalSuggestedPercent = items.reduce((sum, item) => sum + item.suggestedPercent, 0);

  return {
    cost: ids.length * PREDICTION_CREDITS_PER_MATCH,
    fixtureIds: ids,
    modelVersion: PREDICTION_MODEL_VERSION,
    riskLevel: riskLevel || prefs.risk_level,
    summary: summary || `实盘预测 ${ids.length} 场`,
    predictionCount: ids.length,
    selectedCount,
    totalSuggestedPercent,
    preferencesSnapshot:
      preferencesSnapshot ?? {
        riskLevel: prefs.risk_level,
        preferredModels: prefs.preferred_models,
        preferredMarkets: prefs.preferred_markets,
      },
    portfolioSnapshot:
      portfolioSnapshot ?? {
        generatedAt: new Date().toISOString(),
        providers: Array.from(new Set(builtMatches.map((match) => match.provider))),
      },
    items,
    builtMatches,
  };
}
