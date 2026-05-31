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
    yellow_cards?: TheStatsMetric;
    red_cards?: TheStatsMetric;
  };
  np_expected_goals?: TheStatsMetric;
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

function rootMetricPair(metric?: TheStatsMetric) {
  const values = metric?.all;
  return {
    home: safeNumber(values?.home),
    away: safeNumber(values?.away),
  };
}

function preferPositiveMetric(
  primary: { home: number; away: number },
  fallback: { home: number; away: number }
) {
  return primary.home > 0 || primary.away > 0 ? primary : fallback;
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

type OrderSignal = {
  market: string;
  direction: string;
  probability: number;
  fairOdds: number;
  offeredOdds: number | null;
  valueEdge: number | null;
  oddsLabel: string;
  valueLabel: string;
  volatility: "low" | "medium" | "high";
};

function hasPreferredMarket(prefs: UserPreferences, market: string) {
  return prefs.preferred_markets.length === 0 || prefs.preferred_markets.includes(market);
}

function fairOddsFromProbability(probability: number) {
  return Math.round((100 / Math.max(probability, 1)) * 100) / 100;
}

function probabilityFromExpectedGoals(expectedGoals: number, line = 0.5) {
  const value = Math.max(expectedGoals, 0.01);
  if (line <= 0.5) return (1 - Math.exp(-value)) * 100;
  const zero = Math.exp(-value);
  const one = zero * value;
  return (1 - zero - one) * 100;
}

function orderValueLabel(edge: number | null, fallback: string) {
  if (edge == null) return fallback;
  if (edge >= 3) return `价值差 +${edge.toFixed(1)}%`;
  if (edge <= -3) return `市场偏热 ${Math.abs(edge).toFixed(1)}%`;
  return "模型与市场接近";
}

function orderOddsLabel(offeredOdds: number | null, fairOdds: number) {
  return offeredOdds
    ? `市场 ${offeredOdds.toFixed(2)} / 公平 ${fairOdds.toFixed(2)}`
    : `公平 ${fairOdds.toFixed(2)} / 待市场`;
}

function outcomeDirection(market: PredictionResult["valueSignals"][number]["market"]) {
  return {
    homeWin: "主胜方向",
    draw: "平局方向",
    awayWin: "客胜方向",
  }[market];
}

function buildOrderSignals(match: BuiltMatch, prefs: UserPreferences): OrderSignal[] {
  const { prediction, matchData } = match;
  const signals: OrderSignal[] = [];

  if (hasPreferredMarket(prefs, "胜平负")) {
    prediction.valueSignals.forEach((signal) => {
      signals.push({
        market: "胜平负",
        direction: outcomeDirection(signal.market),
        probability: signal.modelProbability,
        fairOdds: signal.fairOdds,
        offeredOdds: signal.offeredOdds,
        valueEdge: signal.edge ?? null,
        oddsLabel: orderOddsLabel(signal.offeredOdds, signal.fairOdds),
        valueLabel: orderValueLabel(signal.edge ?? null, signal.offeredOdds ? "等待市场确认" : "等待市场指数"),
        volatility: signal.market === "draw" ? "medium" : "low",
      });
    });
  }

  if (hasPreferredMarket(prefs, "让球")) {
    const side = prediction.valueSignals.find((signal) => signal.market !== "draw");
    if (side) {
      signals.push({
        market: "让球 / 亚洲让球",
        direction: `${side.market === "homeWin" ? "主队" : "客队"}让球观察`,
        probability: side.modelProbability,
        fairOdds: side.fairOdds,
        offeredOdds: side.offeredOdds,
        valueEdge: side.edge ?? null,
        oddsLabel: orderOddsLabel(side.offeredOdds, side.fairOdds),
        valueLabel: orderValueLabel(side.edge ?? null, matchData.odds.handicap !== "暂无" ? "让球线待校准" : "等待让球市场"),
        volatility: "medium",
      });
    }
  }

  if (hasPreferredMarket(prefs, "大小球")) {
    const over = prediction.probabilities.over25;
    const under = prediction.probabilities.under25;
    const probability = Math.max(over, under);
    const direction = over >= under ? "大 2.5 球方向" : "小 2.5 球方向";
    const fairOdds = fairOddsFromProbability(probability);
    signals.push({
      market: "大小球",
      direction,
      probability,
      fairOdds,
      offeredOdds: null,
      valueEdge: null,
      oddsLabel: `${orderOddsLabel(null, fairOdds)} · 盘口 ${matchData.odds.overUnder}`,
      valueLabel: "基于进球分布",
      volatility: "medium",
    });
  }

  if (hasPreferredMarket(prefs, "双方进球")) {
    const probability = prediction.probabilities.bothTeamsToScore;
    const fairOdds = fairOddsFromProbability(probability);
    signals.push({
      market: "双方进球",
      direction: probability >= 52 ? "双方进球方向" : "双方不进球观察",
      probability,
      fairOdds,
      offeredOdds: null,
      valueEdge: null,
      oddsLabel: orderOddsLabel(null, fairOdds),
      valueLabel: "基于双方进攻强度",
      volatility: "medium",
    });
  }

  if (hasPreferredMarket(prefs, "双重机会")) {
    const candidates = [
      { direction: "主队不败", probability: prediction.probabilities.homeWin + prediction.probabilities.draw },
      { direction: "客队不败", probability: prediction.probabilities.awayWin + prediction.probabilities.draw },
      { direction: "分胜负", probability: prediction.probabilities.homeWin + prediction.probabilities.awayWin },
    ].sort((a, b) => b.probability - a.probability);
    const best = candidates[0];
    const fairOdds = fairOddsFromProbability(best.probability);
    signals.push({
      market: "双重机会",
      direction: best.direction,
      probability: best.probability,
      fairOdds,
      offeredOdds: null,
      valueEdge: null,
      oddsLabel: orderOddsLabel(null, fairOdds),
      valueLabel: "低波动保护",
      volatility: "low",
    });
  }

  if (hasPreferredMarket(prefs, "平局退款")) {
    const home = prediction.probabilities.homeWin;
    const away = prediction.probabilities.awayWin;
    const probability = Math.max(home, away) + prediction.probabilities.draw * 0.35;
    const fairOdds = fairOddsFromProbability(probability);
    signals.push({
      market: "平局退款",
      direction: `${home >= away ? "主队" : "客队"}平局退款`,
      probability,
      fairOdds,
      offeredOdds: null,
      valueEdge: null,
      oddsLabel: orderOddsLabel(null, fairOdds),
      valueLabel: "平局风险保护",
      volatility: "low",
    });
  }

  if (hasPreferredMarket(prefs, "比分")) {
    const probability = clamp(prediction.confidence * 0.18, 8, 22);
    const fairOdds = fairOddsFromProbability(probability);
    signals.push({
      market: "比分",
      direction: `${prediction.predictedScore.label} 小比例观察`,
      probability,
      fairOdds,
      offeredOdds: null,
      valueEdge: null,
      oddsLabel: "需要真实比分市场指数",
      valueLabel: "高波动观察",
      volatility: "high",
    });
  }

  if (hasPreferredMarket(prefs, "球队进球数")) {
    const candidates = [
      {
        direction: `${matchData.homeTeam} 进球 1+`,
        probability: probabilityFromExpectedGoals(prediction.expectedGoals.home),
      },
      {
        direction: `${matchData.awayTeam} 进球 1+`,
        probability: probabilityFromExpectedGoals(prediction.expectedGoals.away),
      },
      {
        direction: `${matchData.homeTeam} 进球 2+`,
        probability: probabilityFromExpectedGoals(prediction.expectedGoals.home, 1.5),
      },
      {
        direction: `${matchData.awayTeam} 进球 2+`,
        probability: probabilityFromExpectedGoals(prediction.expectedGoals.away, 1.5),
      },
    ].sort((a, b) => b.probability - a.probability);
    const best = candidates[0];
    const fairOdds = fairOddsFromProbability(best.probability);
    signals.push({
      market: "球队进球数",
      direction: best.direction,
      probability: best.probability,
      fairOdds,
      offeredOdds: null,
      valueEdge: null,
      oddsLabel: orderOddsLabel(null, fairOdds),
      valueLabel: "基于预期进球",
      volatility: best.probability >= 62 ? "low" : "medium",
    });
  }

  if (hasPreferredMarket(prefs, "半场胜平负")) {
    const top = prediction.valueSignals[0];
    const probability = clamp(top.modelProbability * 0.62, 18, 62);
    const fairOdds = fairOddsFromProbability(probability);
    signals.push({
      market: "半场胜平负",
      direction: `${top.label}半场走势观察`,
      probability,
      fairOdds,
      offeredOdds: null,
      valueEdge: null,
      oddsLabel: "等待半场市场指数",
      valueLabel: "半场波动更高",
      volatility: "high",
    });
  }

  if (hasPreferredMarket(prefs, "半全场")) {
    const top = prediction.valueSignals[0];
    const probability = clamp(prediction.confidence * 0.18, 8, 22);
    const fairOdds = fairOddsFromProbability(probability);
    signals.push({
      market: "半全场",
      direction: `${top.label}相关半全场小比例观察`,
      probability,
      fairOdds,
      offeredOdds: null,
      valueEdge: null,
      oddsLabel: "需要半全场市场指数",
      valueLabel: "高波动玩法",
      volatility: "high",
    });
  }

  if (hasPreferredMarket(prefs, "角球")) {
    const pressure =
      matchData.homeStats.corners +
      matchData.awayStats.corners +
      (matchData.homeStats.shots + matchData.awayStats.shots) * 0.28;
    const probability = clamp(28 + pressure * 4.2, 24, 72);
    const fairOdds = fairOddsFromProbability(probability);
    signals.push({
      market: "角球",
      direction: pressure >= 7 ? "角球偏多观察" : "角球等待实时压力",
      probability,
      fairOdds,
      offeredOdds: null,
      valueEdge: null,
      oddsLabel: "等待角球市场指数",
      valueLabel: "依赖实时压力",
      volatility: "high",
    });
  }

  if (hasPreferredMarket(prefs, "红黄牌")) {
    const probability = clamp(24 + Math.abs(prediction.expectedGoals.home - prediction.expectedGoals.away) * 6, 18, 58);
    const fairOdds = fairOddsFromProbability(probability);
    signals.push({
      market: "红黄牌",
      direction: "牌数风险观察",
      probability,
      fairOdds,
      offeredOdds: null,
      valueEdge: null,
      oddsLabel: "等待裁判和牌数市场",
      valueLabel: "风险观察项",
      volatility: "high",
    });
  }

  if (signals.length > 0) return signals;

  const fallback = prediction.valueSignals[0];
  return [
    {
      market: mapSignalMarket(fallback),
      direction: fallback.label,
      probability: fallback.modelProbability,
      fairOdds: fallback.fairOdds,
      offeredOdds: fallback.offeredOdds,
      valueEdge: fallback.edge ?? null,
      oddsLabel: orderOddsLabel(fallback.offeredOdds, fallback.fairOdds),
      valueLabel: orderValueLabel(fallback.edge ?? null, "等待市场指数"),
      volatility: fallback.market === "draw" ? "medium" : "low",
    },
  ];
}

function orderSignalScore(signal: OrderSignal, prefs: UserPreferences) {
  const edgeScore = Math.max(signal.valueEdge ?? 0, 0) * 2.2;
  const probabilityScore = signal.probability * 0.55;
  const volatilityScore =
    signal.volatility === "low" ? 14 : signal.volatility === "medium" ? 6 : -8;
  const riskAdjustment =
    prefs.risk_level === "conservative"
      ? signal.volatility === "high"
        ? -18
        : signal.volatility === "low"
          ? 8
          : 0
      : prefs.risk_level === "aggressive"
        ? signal.volatility === "high"
          ? 7
          : 0
        : 0;
  const oddsScore = signal.offeredOdds ? Math.min(signal.offeredOdds, 5) * 2 : 0;
  return probabilityScore + edgeScore + volatilityScore + riskAdjustment + oddsScore;
}

function chooseOrderSignal(match: BuiltMatch, prefs: UserPreferences) {
  return buildOrderSignals(match, prefs).sort(
    (a, b) => orderSignalScore(b, prefs) - orderSignalScore(a, prefs)
  )[0];
}

function riskLabelFromSignal(score: number, confidence: number, signal: OrderSignal) {
  if (signal.volatility === "high") return "高";
  if (score >= 78 && confidence >= 65 && signal.probability >= 58) return "低";
  return riskLabel(score, confidence, signal.valueEdge);
}

function buildOrderItem(match: BuiltMatch, prefs: UserPreferences): PredictionOrderItemInput {
  const top = chooseOrderSignal(match, prefs);
  const edge = top.valueEdge;
  const hasMarket = top.offeredOdds != null || edge != null;
  const score = Math.round(
    clamp(
      match.prediction.confidence * 0.72 +
        top.probability * 0.18 +
        Math.max(edge ?? 0, 0) * 1.8 +
        (hasMarket ? 8 : -4) +
        (top.volatility === "low" ? 5 : top.volatility === "high" ? -6 : 0),
      0,
      100
    )
  );
  const threshold = prefs.risk_level === "conservative" ? 66 : prefs.risk_level === "aggressive" ? 58 : 62;
  const selected =
    match.status !== "finished" &&
    score >= threshold &&
    top.volatility !== "high" &&
    (edge != null ? edge >= 2 : top.probability >= 57);

  return {
    fixtureId: match.fixtureId,
    league: match.matchData.league,
    homeTeam: match.matchData.homeTeam,
    awayTeam: match.matchData.awayTeam,
    kickoffAt: match.kickoffAt,
    statusAtPrediction: match.status,
    market: top.market,
    direction: top.direction,
    recommendation: selected ? "selected" : "observe",
    confidence: Math.round(match.prediction.confidence),
    score,
    grade: gradeFromScore(score),
    riskLabel: riskLabelFromSignal(score, match.prediction.confidence, top),
    suggestedPercent: 0,
    fairOdds: top.fairOdds,
    offeredOdds: top.offeredOdds,
    valueEdge: edge,
    oddsLabel: top.oddsLabel,
    valueLabel: top.valueLabel,
    reason: selected
      ? `服务端按用户设置的关注市场完成单场计算，${top.market} 的信号达到当前风险偏好门槛。`
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
  const xg = preferPositiveMetric(
    metricPair(stats, "expected_goals"),
    rootMetricPair(stats?.np_expected_goals)
  );
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
  const rawItems = builtMatches.map((match) => buildOrderItem(match, prefs));
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
