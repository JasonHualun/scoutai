"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { calculateHotScore } from "@/lib/hot-score";
import { translateLeague, translateTeam } from "@/lib/league-translations";
import {
  calculateFootballPrediction,
  MatchAnalysisData,
  PredictionResult,
} from "@/lib/football-prediction";
import {
  Membership,
  PREDICTION_CREDITS_KEY,
  PREDICTION_CREDITS_UPDATED_EVENT,
  PREDICTION_CREDITS_PER_MATCH,
  PRO_TRIAL_CREDITS,
  freeMembership,
} from "@/lib/membership";
import { removeStoredAlertsForMatchIds } from "@/lib/alerts";
import {
  cleanupStoredMatchPools,
  FAVORITES_KEY,
  PREDICTION_POOL_KEY,
  readFavoriteIds,
  readPredictionPoolIds,
  writeStoredMatchIds,
} from "@/lib/match-pools";
import { PREDICTION_MODEL_VERSION, PredictionOrderInput } from "@/lib/prediction-orders";
import {
  defaultPreferenceValues,
  displayPreferenceLabel,
  RiskLevel,
  riskProfiles,
} from "@/lib/preference-options";
import { supabase } from "@/lib/supabase";
import { formatBeijingMatchTime } from "@/lib/time-format";
import { useAuthStore } from "@/lib/authStore";
import { ProPurchaseDialog } from "@/components/ProPurchaseDialog";

type MatchStatus = "live" | "upcoming" | "finished";
type PortfolioMode = "stable" | "balanced" | "opportunity";

type MatchCard = {
  id: number;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickOff: string;
  date?: string;
  minute?: number;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
  leagueId?: number;
};

type FixtureLike = {
  fixture: {
    id: number;
    date: string;
    status: { short: string; elapsed?: number | null };
  };
  league: { id?: number; name: string; round?: string | null };
  teams: { home: { name: string }; away: { name: string } };
  goals: { home?: number | null; away?: number | null };
};

type ApiStatItem = { type: string; value: number | string | null };
type ApiTeamStats = { statistics?: ApiStatItem[] };
type ApiBet = {
  name: string;
  values?: Array<{ value: string; odd?: string }>;
};
type ApiRecentForm = {
  response?: Array<{
    teams: { home: { id: number }; away: { id: number } };
    goals: { home?: number | null; away?: number | null };
  }>;
};
type MatchDetailResponse = {
  statistics?: { response?: ApiTeamStats[] } | null;
  odds?: { response?: Array<{ bookmakers?: Array<{ bets?: ApiBet[] }> }> } | null;
  recentForm?: { home?: ApiRecentForm | null; away?: ApiRecentForm | null };
  teamIds?: { home?: number | null; away?: number | null };
};

type RealtimeStats = {
  possessionHome: number;
  possessionAway: number;
  shotsHome: number;
  shotsAway: number;
  shotsOnTargetHome: number;
  shotsOnTargetAway: number;
  cornersHome: number;
  cornersAway: number;
  xGHome: number;
  xGAway: number;
};

type OddsData = MatchAnalysisData["odds"];
type RecentForm = Array<"W" | "D" | "L">;

type ModelSnapshot = {
  prediction: PredictionResult;
  analysisData: MatchAnalysisData;
  hasRealOdds: boolean;
  hasStats: boolean;
  hasRecentForm: boolean;
};

type PortfolioOpportunity = {
  market: string;
  direction: string;
  probability: number;
  fairOdds: number;
  offeredOdds: number | null;
  edge: number | null;
  bucket: PortfolioPick["portfolioBucket"];
  valueLabel: string;
  oddsLabel: string;
};

type PreferencesRow = {
  risk_level?: RiskLevel | null;
  capital?: number | null;
  preferred_markets?: string[] | null;
  preferred_models?: string[] | null;
};

type PortfolioPick = {
  match: MatchCard;
  score: number;
  confidence: number;
  grade: "A" | "B" | "C";
  role: "核心" | "分散" | "机会" | "观察";
  market: string;
  direction: string;
  reason: string;
  riskLabel: "低波动" | "中等波动" | "波动偏高";
  oddsLabel: string;
  valueLabel: string;
  valueEdge: number | null;
  offeredOdds: number | null;
  fairOdds: number;
  hasRealOdds: boolean;
  portfolioBucket: "稳定主选" | "价值候选" | "冷门观察" | "观察";
  dataBasis: string[];
  exposurePercent: number;
  exposurePoints: number;
  worthWatching: boolean;
};

type PortfolioPlan = {
  mode: PortfolioMode;
  label: string;
  headline: string;
  summary: string;
  picks: PortfolioPick[];
  selectedIds: number[];
  totalExposurePercent: number;
  totalExposurePoints: number;
  coreCount: number;
};

type SingleMatchPrediction = {
  match: MatchCard;
  pick: PortfolioPick;
  signals: PortfolioOpportunity[];
  selected: boolean;
  suggestedPercent: number;
  marketCount: number;
  predictedScore: string;
  expectedGoalsLabel: string;
};

type UserPrefs = {
  risk_level: RiskLevel;
  capital: number;
  preferred_markets: string[];
  preferred_models: string[];
};

const statusLabel: Record<MatchStatus, string> = {
  live: "进行中",
  upcoming: "未开赛",
  finished: "已结束",
};

const portfolioModes: Array<{
  id: PortfolioMode;
  label: string;
  description: string;
  size: number;
  multiplier: number;
  minScore: number;
  maxSameLeague: number;
}> = [
  {
    id: "stable",
    label: "稳单方案",
    description: "以单场为主，优先选择信号最清楚、波动更低的方向。",
    size: 1,
    multiplier: 0.62,
    minScore: 66,
    maxSameLeague: 1,
  },
  {
    id: "balanced",
    label: "均衡单场",
    description: "按每场比赛独立判断，兼顾主流方向、市场指数和波动控制。",
    size: 3,
    multiplier: 0.9,
    minScore: 60,
    maxSameLeague: 2,
  },
  {
    id: "opportunity",
    label: "机会单场",
    description: "更关注高回报方向，但会标出波动偏高和需要市场确认的地方。",
    size: 3,
    multiplier: 1.08,
    minScore: 56,
    maxSameLeague: 2,
  },
];

const riskCapPercent: Record<RiskLevel, number> = {
  conservative: 4,
  balanced: 7,
  aggressive: 10,
};

const defaultPrefs: UserPrefs = {
  risk_level: defaultPreferenceValues.risk_level,
  capital: defaultPreferenceValues.capital,
  preferred_markets: defaultPreferenceValues.preferred_markets,
  preferred_models: defaultPreferenceValues.preferred_models,
};

const neutralStats: RealtimeStats = {
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

const emptyOdds: OddsData = {
  homeWin: 0,
  draw: 0,
  awayWin: 0,
  handicap: "暂无",
  overUnder: "暂无",
};

function mapFixtureToMatchCard(fixture: FixtureLike): MatchCard {
  const statusShort = fixture.fixture.status.short;
  let status: MatchStatus = "upcoming";
  if (["1H", "2H", "ET", "BT"].includes(statusShort)) status = "live";
  else if (["FT", "AET", "PEN", "PST", "CANC", "ABD", "AWD", "WO"].includes(statusShort))
    status = "finished";

  return {
    id: fixture.fixture.id,
    leagueId: fixture.league.id,
    league: `${fixture.league.name} · ${fixture.league.round ?? ""}`.trim(),
    homeTeam: translateTeam(fixture.teams.home.name),
    awayTeam: translateTeam(fixture.teams.away.name),
    kickOff: formatBeijingMatchTime(fixture.fixture.date),
    date: fixture.fixture.date,
    minute: fixture.fixture.status.elapsed ?? undefined,
    homeScore: fixture.goals.home ?? 0,
    awayScore: fixture.goals.away ?? 0,
    status,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatPercent(value: number) {
  return value.toFixed(1).replace(".0", "");
}

function safeStatValue(items: ApiStatItem[] | undefined, type: string) {
  const item = items?.find((stat) => stat.type === type);
  if (!item) return 0;
  const raw =
    typeof item.value === "string" ? Number(item.value.replace("%", "")) : item.value;
  return Number.isFinite(raw) ? Number(raw) : 0;
}

function mapDetailStats(teams?: ApiTeamStats[]): RealtimeStats | null {
  if (!teams || teams.length < 2) return null;

  const home = teams[0].statistics;
  const away = teams[1].statistics;
  const stats = {
    possessionHome: safeStatValue(home, "Ball Possession"),
    possessionAway: safeStatValue(away, "Ball Possession"),
    shotsHome: safeStatValue(home, "Total Shots"),
    shotsAway: safeStatValue(away, "Total Shots"),
    shotsOnTargetHome: safeStatValue(home, "Shots on Target"),
    shotsOnTargetAway: safeStatValue(away, "Shots on Target"),
    cornersHome: safeStatValue(home, "Corner Kicks"),
    cornersAway: safeStatValue(away, "Corner Kicks"),
    xGHome: safeStatValue(home, "Expected Goals"),
    xGAway: safeStatValue(away, "Expected Goals"),
  };

  const hasAnyRealStat =
    stats.shotsHome > 0 ||
    stats.shotsAway > 0 ||
    stats.shotsOnTargetHome > 0 ||
    stats.shotsOnTargetAway > 0 ||
    stats.cornersHome > 0 ||
    stats.cornersAway > 0 ||
    stats.xGHome > 0 ||
    stats.xGAway > 0;

  return hasAnyRealStat ? stats : null;
}

function mapDetailOdds(bets?: ApiBet[]): OddsData | null {
  if (!bets) return null;

  const winner = bets.find((bet) => bet.name === "Match Winner");
  const overUnder = bets.find((bet) => bet.name === "Goals Over/Under");
  const handicap = bets.find((bet) => bet.name === "Asian Handicap");
  const value = (name: string) =>
    Number(winner?.values?.find((item) => item.value === name)?.odd);
  const homeWin = value("Home");
  const draw = value("Draw");
  const awayWin = value("Away");

  if (![homeWin, draw, awayWin].every((odd) => Number.isFinite(odd) && odd > 1)) {
    return null;
  }

  return {
    homeWin,
    draw,
    awayWin,
    handicap: handicap?.values?.[0]?.value ?? "暂无",
    overUnder: overUnder?.values?.[0]?.value ?? "暂无",
  };
}

function mapDetailForm(raw: ApiRecentForm | null | undefined, teamId?: number | null): RecentForm {
  if (!raw?.response?.length || !teamId) return [];

  return raw.response.slice(0, 10).map((fixture) => {
    const isHome = fixture.teams.home.id === teamId;
    const gf = isHome ? fixture.goals.home ?? 0 : fixture.goals.away ?? 0;
    const ga = isHome ? fixture.goals.away ?? 0 : fixture.goals.home ?? 0;
    if (gf > ga) return "W";
    if (gf < ga) return "L";
    return "D";
  });
}

function buildModelSnapshot(
  match: MatchCard,
  detail: MatchDetailResponse | undefined,
  prefs: UserPrefs
): ModelSnapshot {
  const bets = detail?.odds?.response?.[0]?.bookmakers?.[0]?.bets;
  const odds = mapDetailOdds(bets);
  const stats = mapDetailStats(detail?.statistics?.response) ?? neutralStats;
  const homeForm = mapDetailForm(detail?.recentForm?.home, detail?.teamIds?.home);
  const awayForm = mapDetailForm(detail?.recentForm?.away, detail?.teamIds?.away);

  const analysisData: MatchAnalysisData = {
    homeTeam: translateTeam(match.homeTeam),
    awayTeam: translateTeam(match.awayTeam),
    league: translateLeague(match.league),
    homeForm: homeForm.join("-"),
    awayForm: awayForm.join("-"),
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
    odds: odds ?? emptyOdds,
  };

  return {
    prediction: calculateFootballPrediction(analysisData, prefs),
    analysisData,
    hasRealOdds: !!odds,
    hasStats: stats !== neutralStats,
    hasRecentForm: homeForm.length > 0 || awayForm.length > 0,
  };
}

function normalizeRiskLevel(value: unknown): RiskLevel {
  return value === "conservative" || value === "balanced" || value === "aggressive"
    ? value
    : "balanced";
}

function normalizeStringList(value: unknown, fallback: string[]) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : fallback;
}

function riskLabel(level: RiskLevel) {
  return {
    conservative: "保守型",
    balanced: "稳健型",
    aggressive: "进取型",
  }[level];
}

function portfolioRoleLabel(role: PortfolioPick["role"]) {
  return {
    核心: "主看方向",
    分散: "备选方向",
    机会: "机会方向",
    观察: "先观察",
  }[role];
}

function portfolioRiskClass(label: PortfolioPick["riskLabel"]) {
  return {
    低波动: "border-emerald-300/18 bg-emerald-300/8 text-emerald-100",
    中等波动: "border-sky-300/18 bg-sky-300/8 text-sky-100",
    波动偏高: "border-amber-300/22 bg-amber-300/10 text-amber-100",
  }[label];
}

function signalTone(signal: PortfolioOpportunity) {
  if (signal.bucket === "稳定主选") {
    return {
      label: "概率占优",
      className: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
    };
  }
  if (signal.bucket === "价值候选") {
    return {
      label: "可重点看",
      className: "border-[color:var(--accent)]/35 bg-[color:var(--accent)]/10 text-[color:var(--accent)]",
    };
  }
  if (signal.bucket === "冷门观察") {
    return {
      label: "高波动",
      className: "border-amber-300/30 bg-amber-300/10 text-amber-100",
    };
  }
  return {
    label: "观察",
    className: "border-white/10 bg-black/28 text-white/55",
  };
}

function signalSortScore(signal: PortfolioOpportunity) {
  const bucketScore =
    signal.bucket === "稳定主选"
      ? 28
      : signal.bucket === "价值候选"
        ? 20
        : signal.bucket === "冷门观察"
          ? 8
          : 0;
  return bucketScore + signal.probability * 0.45 + Math.max(signal.edge ?? 0, 0) * 2;
}

function formatSignalProbability(signal: PortfolioOpportunity) {
  return signal.probability > 0 ? `${formatPercent(signal.probability)}%` : "观察";
}

function portfolioModeFromPrefs(prefs: UserPrefs): PortfolioMode {
  if (prefs.risk_level === "conservative") return "stable";
  if (prefs.risk_level === "aggressive") return "opportunity";
  return "balanced";
}

function buildPortfolioRiskLabel(
  mode: PortfolioMode,
  score: number,
  hoursUntil: number,
  status: MatchStatus
): PortfolioPick["riskLabel"] {
  const modeRisk = mode === "opportunity" ? 15 : mode === "balanced" ? 9 : 4;
  const timingRisk = hoursUntil > 72 ? 5 : hoursUntil > 24 ? 3 : hoursUntil <= 4 ? 2 : 1;
  const statusRisk = status === "live" ? 7 : status === "finished" ? 6 : 0;
  const signalRisk = score >= 78 ? -5 : score >= 70 ? -3 : score >= 62 ? 3 : 9;
  const riskScore = modeRisk + timingRisk + statusRisk + signalRisk;

  if (riskScore >= 20) return "波动偏高";
  if (riskScore >= 10) return "中等波动";
  return "低波动";
}

function hoursUntilKickoff(match: MatchCard) {
  if (!match.date) return 999;
  return (new Date(match.date).getTime() - Date.now()) / 3_600_000;
}

function fairOddsFromProbability(probability: number) {
  return Math.round((100 / Math.max(probability, 1)) * 100) / 100;
}

function probabilityFromExpectedGoals(expectedGoals: number, line = 0.5) {
  if (line <= 0.5) return (1 - Math.exp(-Math.max(expectedGoals, 0.01))) * 100;
  const zero = Math.exp(-Math.max(expectedGoals, 0.01));
  const one = zero * Math.max(expectedGoals, 0.01);
  return (1 - zero - one) * 100;
}

function outcomeDirection(market: "homeWin" | "draw" | "awayWin") {
  return {
    homeWin: "主胜方向",
    draw: "平局方向",
    awayWin: "客胜方向",
  }[market];
}

function buildOutcomeBucket(
  probability: number,
  fairOdds: number,
  offeredOdds: number | null,
  edge: number | null
): PortfolioPick["portfolioBucket"] {
  if ((offeredOdds ?? fairOdds) >= 3.2 && (edge ?? 0) >= 2) return "冷门观察";
  if (probability >= 58 && fairOdds <= 1.85) return "稳定主选";
  if (edge != null && edge >= 3) return "价值候选";
  if (probability >= 52 && fairOdds <= 2.1) return "价值候选";
  return "观察";
}

function valueLabel(edge: number | null, hasRealOdds: boolean) {
  if (edge == null) {
    return hasRealOdds ? "市场数据不足" : "待市场确认";
  }
  if (edge >= 3) return `模型高于市场 ${edge.toFixed(1)}%`;
  if (edge <= -3) return `市场偏热 ${Math.abs(edge).toFixed(1)}%`;
  return "模型与市场接近";
}

function buildPreferredOpportunities(
  match: MatchCard,
  snapshot: ModelSnapshot,
  prefs: UserPrefs
): PortfolioOpportunity[] {
  const markets = new Set(prefs.preferred_markets);
  const hasMarket = (name: string) => markets.size === 0 || markets.has(name);
  const { prediction } = snapshot;
  const opportunities: PortfolioOpportunity[] = [];

  if (hasMarket("胜平负")) {
    prediction.valueSignals.forEach((signal) => {
      opportunities.push({
        market: "胜平负",
        direction: outcomeDirection(signal.market),
        probability: signal.modelProbability,
        fairOdds: signal.fairOdds,
        offeredOdds: signal.offeredOdds,
        edge: signal.edge,
        bucket: buildOutcomeBucket(
          signal.modelProbability,
          signal.fairOdds,
          signal.offeredOdds,
          signal.edge
        ),
        valueLabel: valueLabel(signal.edge, snapshot.hasRealOdds),
        oddsLabel: signal.offeredOdds
          ? `市场 ${signal.offeredOdds.toFixed(2)} / 公平 ${signal.fairOdds.toFixed(2)}`
          : `公平 ${signal.fairOdds.toFixed(2)} / 待市场`,
      });
    });
  }

  if (hasMarket("大小球")) {
    const over = prediction.probabilities.over25;
    const under = prediction.probabilities.under25;
    const overIsBetter = over >= under;
    const probability = overIsBetter ? over : under;
    const direction = overIsBetter ? "大 2.5 球方向" : "小 2.5 球方向";
    opportunities.push({
      market: "大小球",
      direction,
      probability,
      fairOdds: fairOddsFromProbability(probability),
      offeredOdds: null,
      edge: null,
      bucket: probability >= 58 ? "价值候选" : "观察",
      valueLabel: snapshot.hasRealOdds ? "缺少大小球市场指数" : "待市场确认",
      oddsLabel: `公平 ${fairOddsFromProbability(probability).toFixed(2)} / 待市场`,
    });
  }

  if (hasMarket("双方进球")) {
    const probability = prediction.probabilities.bothTeamsToScore;
    opportunities.push({
      market: "双方进球",
      direction: probability >= 52 ? "双方进球方向" : "双方不进球观察",
      probability,
      fairOdds: fairOddsFromProbability(probability),
      offeredOdds: null,
      edge: null,
      bucket: probability >= 57 ? "价值候选" : "观察",
      valueLabel: snapshot.hasRealOdds ? "缺少双方进球市场指数" : "待市场确认",
      oddsLabel: `公平 ${fairOddsFromProbability(probability).toFixed(2)} / 待市场`,
    });
  }

  if (hasMarket("双重机会")) {
    const homeNoLose = prediction.probabilities.homeWin + prediction.probabilities.draw;
    const awayNoLose = prediction.probabilities.awayWin + prediction.probabilities.draw;
    const noDraw = prediction.probabilities.homeWin + prediction.probabilities.awayWin;
    const best = [
      { direction: "主队不败", probability: homeNoLose },
      { direction: "客队不败", probability: awayNoLose },
      { direction: "分胜负", probability: noDraw },
    ].sort((a, b) => b.probability - a.probability)[0];

    opportunities.push({
      market: "双重机会",
      direction: best.direction,
      probability: best.probability,
      fairOdds: fairOddsFromProbability(best.probability),
      offeredOdds: null,
      edge: null,
      bucket: "稳定主选",
      valueLabel: "低波动保护",
      oddsLabel: `公平 ${fairOddsFromProbability(best.probability).toFixed(2)} / 待市场`,
    });
  }

  if (hasMarket("平局退款")) {
    const home = prediction.probabilities.homeWin;
    const away = prediction.probabilities.awayWin;
    const side = home >= away ? "主队" : "客队";
    const probability = Math.max(home, away) + prediction.probabilities.draw * 0.35;

    opportunities.push({
      market: "平局退款",
      direction: `${side}平局退款`,
      probability,
      fairOdds: fairOddsFromProbability(probability),
      offeredOdds: null,
      edge: null,
      bucket: probability >= 55 ? "稳定主选" : "价值候选",
      valueLabel: "平局保护",
      oddsLabel: `公平 ${fairOddsFromProbability(probability).toFixed(2)} / 待市场`,
    });
  }

  if (hasMarket("让球")) {
    const top = prediction.valueSignals.find((signal) => signal.market !== "draw");
    if (top) {
      opportunities.push({
        market: "让球 / 亚洲让球",
        direction: `${top.market === "homeWin" ? "主队" : "客队"}让球观察`,
        probability: top.modelProbability,
        fairOdds: top.fairOdds,
        offeredOdds: top.offeredOdds,
        edge: top.edge,
        bucket: (top.edge ?? 0) >= 3 ? "价值候选" : "观察",
        valueLabel: valueLabel(top.edge, snapshot.hasRealOdds),
        oddsLabel: top.offeredOdds
          ? `市场 ${top.offeredOdds.toFixed(2)} / 公平 ${top.fairOdds.toFixed(2)}`
          : `公平 ${top.fairOdds.toFixed(2)} / 待市场`,
      });
    }
  }

  if (hasMarket("比分")) {
    opportunities.push({
      market: "比分",
      direction: `${prediction.predictedScore.label} 小注观察`,
      probability: Math.max(8, prediction.confidence * 0.18),
      fairOdds: 100 / Math.max(8, prediction.confidence * 0.18),
      offeredOdds: null,
      edge: null,
      bucket: "冷门观察",
      valueLabel: "高波动观察",
      oddsLabel: "需真实比分市场指数",
    });
  }

  if (hasMarket("球队进球数")) {
    const homeOnePlus = probabilityFromExpectedGoals(prediction.expectedGoals.home);
    const awayOnePlus = probabilityFromExpectedGoals(prediction.expectedGoals.away);
    const homeTwoPlus = probabilityFromExpectedGoals(prediction.expectedGoals.home, 1.5);
    const awayTwoPlus = probabilityFromExpectedGoals(prediction.expectedGoals.away, 1.5);
    const candidates = [
      {
        direction: `${translateTeam(match.homeTeam)} 进球 1+`,
        probability: homeOnePlus,
        fairOdds: fairOddsFromProbability(homeOnePlus),
      },
      {
        direction: `${translateTeam(match.awayTeam)} 进球 1+`,
        probability: awayOnePlus,
        fairOdds: fairOddsFromProbability(awayOnePlus),
      },
      {
        direction: `${translateTeam(match.homeTeam)} 进球 2+`,
        probability: homeTwoPlus,
        fairOdds: fairOddsFromProbability(homeTwoPlus),
      },
      {
        direction: `${translateTeam(match.awayTeam)} 进球 2+`,
        probability: awayTwoPlus,
        fairOdds: fairOddsFromProbability(awayTwoPlus),
      },
    ].sort((a, b) => b.probability - a.probability);
    const best = candidates[0];

    opportunities.push({
      market: "球队进球数",
      direction: best.direction,
      probability: Math.round(best.probability * 10) / 10,
      fairOdds: best.fairOdds,
      offeredOdds: null,
      edge: null,
      bucket: best.probability >= 68 ? "稳定主选" : best.probability >= 55 ? "价值候选" : "观察",
      valueLabel: "基于预期进球",
      oddsLabel: `公平 ${best.fairOdds.toFixed(2)} / 待市场`,
    });
  }

  if (hasMarket("半场胜平负")) {
    const top = prediction.valueSignals[0];
    const probability = clamp(top.modelProbability * 0.62, 18, 62);
    opportunities.push({
      market: "半场胜平负",
      direction: top.market === "draw" ? "半场平局观察" : `${top.label}半场走势观察`,
      probability: Math.round(probability * 10) / 10,
      fairOdds: fairOddsFromProbability(probability),
      offeredOdds: null,
      edge: null,
      bucket: "观察",
      valueLabel: "半场波动更高",
      oddsLabel: "等待半场市场指数",
    });
  }

  if (hasMarket("半全场")) {
    const top = prediction.valueSignals[0];
    const probability = clamp(prediction.confidence * 0.18, 8, 22);
    opportunities.push({
      market: "半全场",
      direction: `${top.label}相关半全场小比例观察`,
      probability: Math.round(probability * 10) / 10,
      fairOdds: fairOddsFromProbability(probability),
      offeredOdds: null,
      edge: null,
      bucket: "冷门观察",
      valueLabel: "高波动玩法",
      oddsLabel: "需半全场市场指数",
    });
  }

  if (hasMarket("角球")) {
    const data = snapshot.analysisData;
    const cornerPressure =
      data.homeStats.corners +
      data.awayStats.corners +
      (data.homeStats.shots + data.awayStats.shots) * 0.28;
    const probability = clamp(28 + cornerPressure * 4.2, 24, 72);
    opportunities.push({
      market: "角球",
      direction: cornerPressure >= 7 ? "角球偏多观察" : "等待角球压力确认",
      probability: Math.round(probability * 10) / 10,
      fairOdds: fairOddsFromProbability(probability),
      offeredOdds: null,
      edge: null,
      bucket: snapshot.hasStats && probability >= 58 ? "价值候选" : "观察",
      valueLabel: snapshot.hasStats ? "基于射门和角球压力" : "等待实时角球数据",
      oddsLabel: "需角球盘口指数",
    });
  }

  if (hasMarket("红黄牌")) {
    const derbyLike = /德比|derby|milan|madrid|barcelona|dortmund|roma|lazio/i.test(
      `${match.homeTeam} ${match.awayTeam} ${match.league}`
    );
    const probability = derbyLike ? 48 : 34;
    opportunities.push({
      market: "红黄牌",
      direction: derbyLike ? "牌数风险偏高观察" : "牌数风险观察",
      probability,
      fairOdds: fairOddsFromProbability(probability),
      offeredOdds: null,
      edge: null,
      bucket: "观察",
      valueLabel: "风险提醒项",
      oddsLabel: "等待裁判和牌类市场",
    });
  }

  if (opportunities.length > 0) return opportunities;

  const fallback = prediction.valueSignals[0];
  return [
    {
      market: "胜平负",
      direction: outcomeDirection(fallback.market),
      probability: fallback.modelProbability,
      fairOdds: fallback.fairOdds,
      offeredOdds: fallback.offeredOdds,
      edge: fallback.edge,
      bucket: buildOutcomeBucket(
        fallback.modelProbability,
        fallback.fairOdds,
        fallback.offeredOdds,
        fallback.edge
      ),
      valueLabel: valueLabel(fallback.edge, snapshot.hasRealOdds),
      oddsLabel: fallback.offeredOdds
        ? `市场 ${fallback.offeredOdds.toFixed(2)} / 公平 ${fallback.fairOdds.toFixed(2)}`
        : `公平 ${fallback.fairOdds.toFixed(2)} / 待市场`,
    },
  ];
}

function chooseOpportunity(
  opportunities: PortfolioOpportunity[],
  mode: PortfolioMode
): PortfolioOpportunity {
  const scored = opportunities.map((item) => {
    const edgeScore = item.edge ?? (item.bucket === "稳定主选" ? 1 : 0);
    const oddsScore = item.offeredOdds ?? item.fairOdds;
    const bucketScore =
      item.bucket === "稳定主选" ? 8 : item.bucket === "价值候选" ? 5 : item.bucket === "冷门观察" ? 3 : 0;

    const score =
      mode === "stable"
        ? item.probability * 1.2 - item.fairOdds * 7 + bucketScore * 3 + edgeScore
        : mode === "opportunity"
          ? oddsScore * 8 + Math.max(edgeScore, 0) * 3 + item.probability * 0.2
          : item.probability * 0.65 + Math.max(edgeScore, 0) * 4 + bucketScore * 2;

    return { item, score };
  });

  return scored.sort((a, b) => b.score - a.score)[0]?.item ?? opportunities[0];
}

function estimatedPickOdds(pick: PortfolioPick) {
  return Math.max(1.01, pick.offeredOdds ?? pick.fairOdds);
}

function combinedOdds(picks: PortfolioPick[]) {
  if (picks.length === 0) return 0;
  return picks.reduce((product, pick) => product * estimatedPickOdds(pick), 1);
}

function buildDataBasis(match: MatchCard, prefs: UserPrefs, snapshot: ModelSnapshot) {
  const basis = ["预测池", "赛程时间", "联赛权重", "球队关注度"];
  if (match.status === "live") basis.push("实时比分");
  if (snapshot.hasRealOdds) basis.push("市场指数");
  else basis.push("待市场确认");
  if (snapshot.hasStats) basis.push("实时统计");
  if (snapshot.hasRecentForm) basis.push("近况");
  if (prefs.preferred_models.includes("凯利风控")) basis.push("模拟风控");
  if (prefs.preferred_models.includes("爆冷检测")) basis.push("冷门检查");
  return basis;
}

function buildReason(
  match: MatchCard,
  score: number,
  mode: PortfolioMode,
  confidence: number,
  opportunity: PortfolioOpportunity,
  snapshot: ModelSnapshot
) {
  if (match.status === "finished") return "比赛已结束，只保留复盘价值，不再作为赛前单场推荐。";
  if (match.status === "live") {
    return Math.abs(match.homeScore - match.awayScore) <= 1
      ? "实时比分仍接近，保留单场观察价值；临场数据更新时会继续校准。"
      : "比分差距已经拉开，模型会降低单场权重，避免追高。";
  }
  if (!snapshot.hasRealOdds) {
    return `市场指数暂未更新，先按模型公平指数筛选：${opportunity.direction}，${opportunity.valueLabel}。市场确认后会重新计算价值差和占比建议。`;
  }
  if (opportunity.bucket === "冷门观察") {
    return `${opportunity.direction} 属于高波动机会，${opportunity.valueLabel}；只适合小比例观察，不适合过度集中。`;
  }
  if (opportunity.bucket === "稳定主选") {
    return `${opportunity.direction} 的模型概率更稳，${opportunity.valueLabel}；适合作为这场比赛的主看方向。`;
  }
  if (score >= 74) {
  return `预测池里信号较强，当前信号强度 ${confidence}%，${opportunity.valueLabel}，适合作为单场主看候选。`;
  }
  if (score >= 62) {
    return `${opportunity.direction} 信息量够用，适合作为分散场次；不建议把本次比例集中在这一场。`;
  }
  return mode === "opportunity"
    ? "信号偏弱，只能作为小比例机会观察，等市场线和阵容数据确认。"
    : "当前信号不够强，优先放在观察区，不强行给主看方向。";
}

function buildPortfolioPick(
  match: MatchCard,
  mode: PortfolioMode,
  prefs: UserPrefs,
  detail?: MatchDetailResponse
): PortfolioPick {
  const modeConfig = portfolioModes.find((item) => item.id === mode) ?? portfolioModes[1];
  const snapshot = buildModelSnapshot(match, detail, prefs);
  const opportunities = buildPreferredOpportunities(match, snapshot, prefs);
  const opportunity = chooseOpportunity(opportunities, mode);
  const hotScore = calculateHotScore({
    leagueId: match.leagueId ?? 0,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    status: match.status,
    date: match.date,
    minute: match.minute,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    isUserFavoriteLeague: true,
  });
  const hoursUntil = hoursUntilKickoff(match);
  const timingBoost = hoursUntil <= 4 ? 4 : hoursUntil <= 24 ? 2 : 0;
  const statusPenalty = match.status === "finished" ? -35 : 0;
  const livePenalty =
    match.status === "live" && Math.abs(match.homeScore - match.awayScore) >= 2 ? -8 : 0;
  const modelBoost =
    (prefs.preferred_models.includes("近期状态评分") ? 2 : 0) +
    (prefs.preferred_models.includes("爆冷检测") ? 2 : 0) +
    (prefs.preferred_models.includes("凯利风控") ? 1 : 0);
  const marketBoost =
    (prefs.preferred_markets.includes("胜平负") ? 1 : 0) +
    (prefs.preferred_markets.includes("大小球") ? 1 : 0) +
    (prefs.preferred_markets.includes("双重机会") && mode === "stable" ? 2 : 0);
  const modeAdjustment = mode === "stable" ? -1 : mode === "opportunity" ? 2 : 0;
  const edgeBoost = opportunity.edge == null ? 0 : clamp(opportunity.edge * 1.2, -8, 12);
  const dataBoost =
    (snapshot.hasRealOdds ? 6 : -4) + (snapshot.hasStats ? 3 : 0) + (snapshot.hasRecentForm ? 2 : 0);
  const probabilityBoost = (opportunity.probability - 50) * 0.35;
  const score = clamp(
    hotScore * 0.35 +
      snapshot.prediction.confidence * 0.38 +
      probabilityBoost +
      edgeBoost +
      dataBoost +
      timingBoost +
      statusPenalty +
      livePenalty +
      modelBoost +
      marketBoost +
      modeAdjustment,
    0,
    100
  );
  const grade = score >= 74 ? "A" : score >= 62 ? "B" : "C";
  const volatility =
    (mode === "opportunity" ? 18 : mode === "balanced" ? 10 : 5) +
    (match.status === "live" ? 8 : 0) +
    (hoursUntil > 72 ? 6 : 0);
  const confidence = clamp(
    Math.round(snapshot.prediction.confidence + (opportunity.edge ?? 0) * 0.5 - volatility * 0.2),
    35,
    88
  );
  const worthWatching = score >= modeConfig.minScore && match.status !== "finished";
  const cap = riskCapPercent[prefs.risk_level];
  const bucketMultiplier =
    opportunity.bucket === "稳定主选"
      ? 1.15
      : opportunity.bucket === "冷门观察"
        ? 0.42
        : opportunity.bucket === "价值候选"
          ? 0.82
          : 0.25;
  const oddsConfidenceMultiplier = snapshot.hasRealOdds ? 1 : 0.58;
  const rawPercent =
    ((score - 48) / 52) * cap * modeConfig.multiplier * bucketMultiplier * oddsConfidenceMultiplier;
  const maxSinglePercent =
    opportunity.bucket === "冷门观察"
      ? cap * 0.22
      : opportunity.bucket === "稳定主选"
        ? cap * 0.58
        : mode === "balanced"
          ? cap * 0.46
          : cap * 0.38;
  const exposurePercent = worthWatching ? clamp(rawPercent, 0.6, maxSinglePercent) : 0;
  const riskLabel =
    opportunity.bucket === "冷门观察"
      ? "波动偏高"
      : buildPortfolioRiskLabel(mode, score, hoursUntil, match.status);
  const role = !worthWatching
    ? "观察"
    : opportunity.bucket === "冷门观察"
      ? "机会"
      : opportunity.bucket === "稳定主选" || score >= 74
      ? "核心"
      : mode === "opportunity"
        ? "机会"
        : "分散";

  return {
    match,
    score: Math.round(score),
    confidence,
    grade,
    role,
    market: opportunity.market,
    direction: opportunity.direction,
    reason: buildReason(match, score, mode, confidence, opportunity, snapshot),
    riskLabel,
    oddsLabel: opportunity.oddsLabel,
    valueLabel: opportunity.valueLabel,
    valueEdge: opportunity.edge,
    offeredOdds: opportunity.offeredOdds,
    fairOdds: opportunity.fairOdds,
    hasRealOdds: snapshot.hasRealOdds,
    portfolioBucket: worthWatching ? opportunity.bucket : "观察",
    dataBasis: buildDataBasis(match, prefs, snapshot),
    exposurePercent,
    exposurePoints: Math.round((prefs.capital * exposurePercent) / 100),
    worthWatching,
  };
}

function buildPortfolioPlan(
  matches: MatchCard[],
  mode: PortfolioMode,
  prefs: UserPrefs,
  detailByMatch: Record<number, MatchDetailResponse>
): PortfolioPlan {
  const config = portfolioModes.find((item) => item.id === mode) ?? portfolioModes[1];
  const picks = matches
    .map((match) => buildPortfolioPick(match, mode, prefs, detailByMatch[match.id]))
    .sort((a, b) => {
      if (mode === "opportunity") {
        return estimatedPickOdds(b) - estimatedPickOdds(a) || b.score - a.score;
      }
      if (mode === "stable") {
        return a.riskLabel.localeCompare(b.riskLabel) || b.confidence - a.confidence || b.score - a.score;
      }
      return b.score - a.score || a.riskLabel.localeCompare(b.riskLabel);
    });
  const selected: PortfolioPick[] = [];

  for (const pick of picks) {
    if (!pick.worthWatching) continue;
    if (mode === "balanced" && estimatedPickOdds(pick) < 1.75 && selected.length > 0) continue;
    if (mode === "opportunity" && estimatedPickOdds(pick) < 2 && selected.length > 0) continue;
    const sameLeagueCount = selected.filter(
      (item) => item.match.leagueId === pick.match.leagueId
    ).length;
    if (sameLeagueCount >= config.maxSameLeague && selected.length < config.size - 1) continue;
    selected.push(pick);
    if (selected.length >= config.size) break;
    if (mode === "balanced" && selected.length >= 2 && combinedOdds(selected) >= 2) break;
    if (mode === "opportunity" && selected.length >= 2 && combinedOdds(selected) >= 5) break;
  }

  if (selected.length === 0 && picks[0]?.score >= 58 && picks[0].match.status !== "finished") {
    selected.push({ ...picks[0], role: "观察", exposurePercent: 0, exposurePoints: 0 });
  }

  const totalExposurePercent = selected.length > 0 ? 100 : 0;
  const totalExposurePoints = 0;
  const label = config.label;
  const headline =
    selected.length <= 1
      ? "本期单场优先"
      : mode === "stable"
        ? "稳单优先"
        : mode === "opportunity"
          ? "机会单场"
        : "均衡单场";
  const summary =
    selected.length <= 1
      ? "以单场为主，先把这一场的方向和关注市场讲清楚。"
      : `${label} 选出 ${selected.length} 场主看候选，系统会按每场信号强弱给出单场占比建议。`;

  return {
    mode,
    label,
    headline,
    summary,
    picks,
    selectedIds: selected.map((pick) => pick.match.id),
    totalExposurePercent,
    totalExposurePoints,
    coreCount: selected.filter((pick) => pick.role === "核心").length,
  };
}

function readLocalPredictionCredits() {
  const raw = window.localStorage.getItem(PREDICTION_CREDITS_KEY);
  const parsed = raw == null ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : PRO_TRIAL_CREDITS;
}

function writeLocalPredictionCredits(value: number) {
  const credits = Math.max(0, Math.round(value));
  window.localStorage.setItem(PREDICTION_CREDITS_KEY, String(credits));
  window.dispatchEvent(new Event(PREDICTION_CREDITS_UPDATED_EVENT));
  return credits;
}

export default function FavoritesPage() {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const session = useAuthStore((state) => state.session);

  const [favoriteMatches, setFavoriteMatches] = useState<MatchCard[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [predictionPoolMatches, setPredictionPoolMatches] = useState<MatchCard[]>([]);
  const [predictionPoolIds, setPredictionPoolIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailByMatch, setDetailByMatch] = useState<Record<number, MatchDetailResponse>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [membership, setMembership] = useState<Membership>(() => freeMembership());
  const [userPrefs, setUserPrefs] = useState<UserPrefs | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectionTouched, setSelectionTouched] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [predictionCredits, setPredictionCredits] = useState<number | null>(null);
  const [predictionStarted, setPredictionStarted] = useState(false);
  const [predictionSubmitting, setPredictionSubmitting] = useState(false);
  const [predictionMessage, setPredictionMessage] = useState<string | null>(null);
  const [cleanupNotice, setCleanupNotice] = useState<string | null>(null);

  const isPro = membership.plan === "pro" && membership.status === "active";
  const isPredictionPage = pathname.startsWith("/predict");
  const activePrefs = isPro && userPrefs ? userPrefs : defaultPrefs;

  useEffect(() => {
    if (!isPro) {
      setPredictionCredits(null);
      setPredictionStarted(false);
      return;
    }

    const nextCredits =
      typeof membership.predictionCredits === "number"
        ? writeLocalPredictionCredits(membership.predictionCredits)
        : writeLocalPredictionCredits(readLocalPredictionCredits());
    setPredictionCredits(nextCredits);
  }, [isPro, membership.predictionCredits]);

  useEffect(() => {
    async function load() {
      try {
        let favoriteIdsFromStorage = readFavoriteIds();
        let predictionIdsFromStorage = readPredictionPoolIds();
        setFavoriteIds(favoriteIdsFromStorage);
        setPredictionPoolIds(predictionIdsFromStorage);

        const allIds = [...new Set([...favoriteIdsFromStorage, ...predictionIdsFromStorage])];
        if (allIds.length === 0) return;

        const res = await fetch("/api/football/all");
        const json = (await res.json()) as { fixtures?: FixtureLike[] };

        if (Array.isArray(json.fixtures)) {
          const matches = json.fixtures.map(mapFixtureToMatchCard);
          const cleanup = cleanupStoredMatchPools(matches, { removeMissing: true });
          if (cleanup.removedIds.length > 0) {
            removeStoredAlertsForMatchIds(cleanup.removedIds);
            favoriteIdsFromStorage = cleanup.favoriteIds;
            predictionIdsFromStorage = cleanup.predictionPoolIds;
            setFavoriteIds(favoriteIdsFromStorage);
            setPredictionPoolIds(predictionIdsFromStorage);
            setCleanupNotice(
              `已自动移出 ${cleanup.removedIds.length} 场已结束或过期的比赛。已花积分生成过的预测记录会保留在历史预测里。`
            );
          }

          const matchMap = new Map(
            matches.map((match) => [
              String(match.id),
              match,
            ])
          );
          setFavoriteMatches(
            favoriteIdsFromStorage
              .map((id) => matchMap.get(String(id)))
              .filter((match): match is MatchCard => !!match && match.status !== "finished")
          );
          setPredictionPoolMatches(
            predictionIdsFromStorage
              .map((id) => matchMap.get(String(id)))
              .filter((match): match is MatchCard => !!match && match.status !== "finished")
          );
        }
      } catch (error) {
        console.error("[favorites] failed to load:", error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  useEffect(() => {
    if (predictionPoolMatches.length === 0) {
      setDetailByMatch({});
      return;
    }

    let cancelled = false;
    async function loadMatchDetails() {
      setDetailLoading(true);
      try {
        const results = await Promise.allSettled(
          predictionPoolMatches.slice(0, 12).map(async (match) => {
            const res = await fetch(`/api/match/${match.id}`);
            if (!res.ok) throw new Error("match detail failed");
            const detail = (await res.json()) as MatchDetailResponse;
            return [match.id, detail] as const;
          })
        );

        if (cancelled) return;
        const next: Record<number, MatchDetailResponse> = {};
        results.forEach((result) => {
          if (result.status === "fulfilled") {
            next[result.value[0]] = result.value[1];
          }
        });
        setDetailByMatch(next);
      } catch (error) {
        if (!cancelled) {
          console.error("[favorites] failed to load match details:", error);
          setDetailByMatch({});
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    void loadMatchDetails();
    return () => {
      cancelled = true;
    };
  }, [predictionPoolMatches]);

  useEffect(() => {
    let cancelled = false;

    async function loadMembership() {
      if (!session) {
        setMembership(freeMembership(user?.email));
        return;
      }

      try {
        const res = await fetch("/api/membership", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = (await res.json()) as { membership?: Membership };
        const nextMembership = json.membership ?? freeMembership(user?.email);
        if (!cancelled) setMembership(nextMembership);
        if (!cancelled && typeof nextMembership.predictionCredits === "number") {
          setPredictionCredits(writeLocalPredictionCredits(nextMembership.predictionCredits));
        }
      } catch {
        if (!cancelled) setMembership(freeMembership(user?.email));
      }
    }

    loadMembership();
    return () => {
      cancelled = true;
    };
  }, [session, user?.email]);

  useEffect(() => {
    let cancelled = false;

    async function loadPreferences() {
      if (!session || !user) {
        setUserPrefs(null);
        return;
      }

      try {
        const { data } = await supabase
          .from("user_preferences")
          .select("risk_level, capital, preferred_markets, preferred_models")
          .eq("user_id", user.id)
          .maybeSingle<PreferencesRow>();

        if (cancelled) return;
        setUserPrefs({
          risk_level: normalizeRiskLevel(data?.risk_level),
          capital:
            typeof data?.capital === "number" && Number.isFinite(data.capital)
              ? data.capital
              : defaultPrefs.capital,
          preferred_markets: normalizeStringList(
            data?.preferred_markets,
            defaultPrefs.preferred_markets
          ),
          preferred_models: normalizeStringList(
            data?.preferred_models,
            defaultPrefs.preferred_models
          ),
        });
      } catch {
        if (!cancelled) setUserPrefs(defaultPrefs);
      }
    }

    loadPreferences();
    return () => {
      cancelled = true;
    };
  }, [session, user]);

  const activePortfolioMode = portfolioModeFromPrefs(activePrefs);
  const plansByMode = useMemo(
    () =>
      portfolioModes.map((mode) =>
        buildPortfolioPlan(predictionPoolMatches, mode.id, activePrefs, detailByMatch)
      ),
    [activePrefs, detailByMatch, predictionPoolMatches]
  );
  const activePlan = useMemo(
    () =>
      plansByMode.find((plan) => plan.mode === activePortfolioMode) ??
      buildPortfolioPlan(predictionPoolMatches, activePortfolioMode, activePrefs, detailByMatch),
    [activePortfolioMode, activePrefs, detailByMatch, predictionPoolMatches, plansByMode]
  );
  const portfolioPicks = activePlan.picks;
  const modeConfig =
    portfolioModes.find((item) => item.id === activePortfolioMode) ?? portfolioModes[1];
  const recommendedIds = activePlan.selectedIds;
  const activeSelectedIds = useMemo(
    () => (predictionStarted ? (selectionTouched ? selectedIds : recommendedIds) : []),
    [predictionStarted, recommendedIds, selectedIds, selectionTouched]
  );
  const selectedSet = useMemo(() => new Set(activeSelectedIds), [activeSelectedIds]);
  const selectedPicks = useMemo(
    () => portfolioPicks.filter((pick) => selectedSet.has(pick.match.id)),
    [portfolioPicks, selectedSet]
  );
  const selectedWeightTotal = selectedPicks.reduce(
    (sum, pick) => sum + Math.max(1, pick.exposurePercent),
    0
  );
  const allocationByMatch = selectedPicks.reduce<Record<number, number>>((map, pick) => {
    map[pick.match.id] =
      selectedWeightTotal > 0
        ? (Math.max(1, pick.exposurePercent) / selectedWeightTotal) * 100
        : 0;
    return map;
  }, {});
  const singleMatchPredictions = useMemo<SingleMatchPrediction[]>(
    () =>
      predictionPoolMatches.map((match) => {
        const snapshot = buildModelSnapshot(match, detailByMatch[match.id], activePrefs);
        const signals = buildPreferredOpportunities(match, snapshot, activePrefs).sort(
          (a, b) => signalSortScore(b) - signalSortScore(a)
        );
        const pick =
          portfolioPicks.find((item) => item.match.id === match.id) ??
          buildPortfolioPick(match, activePortfolioMode, activePrefs, detailByMatch[match.id]);
        const selected = selectedSet.has(match.id);

        return {
          match,
          pick,
          signals,
          selected,
          suggestedPercent: selected ? allocationByMatch[match.id] ?? 0 : 0,
          marketCount: activePrefs.preferred_markets.length,
          predictedScore: snapshot.prediction.predictedScore.label,
          expectedGoalsLabel: `${snapshot.prediction.expectedGoals.home.toFixed(2)} - ${snapshot.prediction.expectedGoals.away.toFixed(2)}`,
        };
      }),
    [
      activePortfolioMode,
      activePrefs,
      allocationByMatch,
      detailByMatch,
      portfolioPicks,
      predictionPoolMatches,
      selectedSet,
    ]
  );
  const predictionPoolIdsKey = predictionPoolIds.join(",");
  const firstPredictionMatchId = predictionPoolMatches[0]?.id;
  const isEmpty =
    !loading &&
    (isPredictionPage ? predictionPoolMatches.length === 0 : favoriteMatches.length === 0);
  const activeProfile = riskProfiles[activePrefs.risk_level];
  const visibleModels = activePrefs.preferred_models.slice(0, 3).map(displayPreferenceLabel);
  const visibleMarkets = activePrefs.preferred_markets.slice(0, 4).map(displayPreferenceLabel);
  const predictionCost = predictionPoolMatches.length * PREDICTION_CREDITS_PER_MATCH;
  const missingPredictionCredits = Math.max(0, predictionCost - (predictionCredits ?? 0));
  const startPredictionButtonLabel = predictionSubmitting
    ? "正在生成推荐..."
    : predictionStarted
      ? "已生成本次推荐"
      : predictionPoolMatches.length === 0
        ? "先加入预测池"
        : !isPro
          ? "开通 Pro 后预测"
          : missingPredictionCredits > 0
            ? "购买积分增加场次"
            : "开始预测推荐";

  useEffect(() => {
    setPredictionStarted(false);
    setPredictionSubmitting(false);
    setPredictionMessage(null);
  }, [predictionPoolIdsKey, predictionPoolMatches.length]);

  function handleUnfavorite(id: number) {
    const updated = favoriteIds.filter((favoriteId) => favoriteId !== id);
    setFavoriteIds(writeStoredMatchIds(FAVORITES_KEY, updated));
    setFavoriteMatches((prev) => prev.filter((match) => match.id !== id));
  }

  function handleTogglePredictionPool(match: MatchCard) {
    const exists = predictionPoolIds.includes(match.id);
    const updated = exists
      ? predictionPoolIds.filter((matchId) => matchId !== match.id)
      : [...predictionPoolIds, match.id];
    setPredictionPoolIds(writeStoredMatchIds(PREDICTION_POOL_KEY, updated));
    setPredictionPoolMatches((prev) =>
      exists ? prev.filter((item) => item.id !== match.id) : [...prev, match]
    );
    setDetailByMatch((prev) => {
      const next = { ...prev };
      if (exists) delete next[match.id];
      return next;
    });
    setSelectedIds((prev) => prev.filter((matchId) => matchId !== match.id));
  }

  function handleRemoveFromPredictionPool(id: number) {
    const updated = predictionPoolIds.filter((matchId) => matchId !== id);
    setPredictionPoolIds(writeStoredMatchIds(PREDICTION_POOL_KEY, updated));
    setPredictionPoolMatches((prev) => prev.filter((match) => match.id !== id));
    setDetailByMatch((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSelectedIds((prev) => prev.filter((matchId) => matchId !== id));
  }

  async function handleStartPrediction() {
    if (predictionSubmitting) return;

    if (!isPro) {
      openUpgrade();
      return;
    }

    if (predictionStarted) {
      setPredictionMessage("本次预测已经生成。修改预测池后，可重新扣分生成新的推荐。");
      return;
    }

    if (detailLoading) {
      setPredictionMessage("正在读取市场线和近况数据，请稍等几秒再开始预测。");
      return;
    }

    if (predictionPoolMatches.length === 0) {
      setPredictionMessage("请先把要预测的比赛加入预测池。");
      return;
    }

    if (missingPredictionCredits > 0) {
      setPredictionMessage(
        `还需要 ${missingPredictionCredits} 预测积分，可预测当前预测池 ${predictionPoolMatches.length} 场比赛。`
      );
      openUpgrade();
      return;
    }

    setPredictionSubmitting(true);

    try {
      let nextCredits = Math.max(0, (predictionCredits ?? 0) - predictionCost);
      if (session?.access_token) {
        const selectedPickIds = new Set(recommendedIds);
        const recommendedPicks = portfolioPicks.filter((pick) => selectedPickIds.has(pick.match.id));
        const recommendedWeightTotal = recommendedPicks.reduce(
          (sum, pick) => sum + Math.max(1, pick.exposurePercent),
          0
        );
        const recommendedAllocation = recommendedPicks.reduce<Record<number, number>>((map, pick) => {
          map[pick.match.id] =
            recommendedWeightTotal > 0
              ? (Math.max(1, pick.exposurePercent) / recommendedWeightTotal) * 100
              : 0;
          return map;
        }, {});
        const orderPayload: PredictionOrderInput = {
          cost: predictionCost,
          modelVersion: PREDICTION_MODEL_VERSION,
          riskLevel: activePrefs.risk_level,
          summary: `逐场单场预测 · 预测池 ${predictionPoolMatches.length} 场`,
          predictionCount: predictionPoolMatches.length,
          selectedCount: recommendedIds.length,
          totalSuggestedPercent: 100,
          preferencesSnapshot: {
            riskLevel: activePrefs.risk_level,
            preferredModels: activePrefs.preferred_models,
            preferredMarkets: activePrefs.preferred_markets,
            capital: activePrefs.capital,
          },
          portfolioSnapshot: {
            mode: activePlan.mode,
            label: activePlan.label,
            headline: activePlan.headline,
            selectedIds: recommendedIds,
            generatedAt: new Date().toISOString(),
          },
          items: portfolioPicks.map((pick) => ({
            fixtureId: pick.match.id,
            league: translateLeague(pick.match.league),
            homeTeam: translateTeam(pick.match.homeTeam),
            awayTeam: translateTeam(pick.match.awayTeam),
            kickoffAt: pick.match.date ?? null,
            statusAtPrediction: pick.match.status,
            market: pick.market,
            direction: pick.direction,
            recommendation: selectedPickIds.has(pick.match.id) ? "selected" : "observe",
            confidence: pick.confidence,
            score: pick.score,
            grade: pick.grade,
            riskLabel: pick.riskLabel,
            suggestedPercent: selectedPickIds.has(pick.match.id)
              ? recommendedAllocation[pick.match.id] ?? 0
              : 0,
            fairOdds: pick.fairOdds,
            offeredOdds: pick.offeredOdds,
            valueEdge: pick.valueEdge,
            oddsLabel: pick.oddsLabel,
            valueLabel: pick.valueLabel,
            reason: pick.reason,
            dataBasis: pick.dataBasis,
          })),
        };

        const res = await fetch("/api/prediction-orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(orderPayload),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          orderId?: string;
          credits?: number;
          error?: string;
        };
        if (res.ok && typeof json.credits === "number") {
          nextCredits = json.credits;
        } else if (res.status === 402) {
          setPredictionMessage(json.error ?? "预测积分不足，请先购买积分。");
          openUpgrade();
          return;
        } else {
          setPredictionMessage(json.error ?? "扣除预测积分失败，请稍后再试。");
          return;
        }
      }

      writeLocalPredictionCredits(nextCredits);
      setPredictionCredits(nextCredits);
      setPredictionStarted(true);
      setPredictionMessage(
        `已扣除 ${predictionCost} 预测积分，本次按预测池 ${predictionPoolMatches.length} 场比赛生成单场推荐，并已保存到历史预测。`
      );
      setSelectionTouched(false);
      setSelectedIds(recommendedIds);
    } catch {
      setPredictionMessage("扣分接口连接失败，本次没有生成推荐，请稍后重试。");
    } finally {
      setPredictionSubmitting(false);
    }
  }

  function togglePortfolioMatch(id: number) {
    if (!isPro) return;
    setSelectionTouched(true);
    setSelectedIds((current) => {
      const base = selectionTouched ? current : activeSelectedIds;
      return base.includes(id) ? base.filter((item) => item !== id) : [...base, id];
    });
  }

  function resetPortfolio() {
    setSelectionTouched(false);
    setSelectedIds([]);
  }

  function openUpgrade() {
    setUpgradeOpen(true);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isPredictionPage ? "预测" : "收藏"}
          </h1>
          <p className="mt-2 text-sm text-white/60">
            {isPredictionPage
              ? "预测池只放你要花积分预测的比赛。系统按单场逐场计算，并优先读取设置页勾选的关注市场。"
              : "收藏用于快速查看实时数据和异常提醒。比赛结束后会自动移出；需要预测时，再把比赛加入预测池。"}
          </p>
        </div>
        <div className="rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[11px] text-white/60">
          {isPro
            ? `${riskLabel(activePrefs.risk_level)} · 剩余 ${predictionCredits ?? PRO_TRIAL_CREDITS} 预测积分`
            : "当前为免费版"}
        </div>
      </div>

      {cleanupNotice && (
        <div className="rounded-2xl border border-[color:var(--accent)]/22 bg-[color:var(--accent)]/8 px-4 py-3 text-xs leading-5 text-[color:var(--accent)]">
          {cleanupNotice}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-[color:var(--card)]/70 p-6 text-sm text-white/60">
          加载收藏中...
        </div>
      ) : isEmpty ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-[color:var(--card)]/60 p-6 text-sm text-white/60">
          <div className="mb-3 text-base text-white/75">
            {isPredictionPage ? "预测池暂无比赛" : "暂无收藏比赛"}
          </div>
            <p className="mb-4 max-w-xl text-xs leading-5 text-white/55">
            {isPredictionPage
              ? "去热门赛事页，把需要大模型预测的比赛点“加入预测”。预测池里的比赛才会扣积分。"
              : "去热门赛事页，把想跟踪实时数据和异常提醒的比赛点“收藏”。收藏不会自动进入预测池。"}
          </p>
          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-[color:var(--accent)]/60 px-3 py-1.5 text-xs text-[color:var(--accent)] hover:bg-[color:var(--accent)]/10"
          >
            返回热门赛事
          </Link>
        </div>
      ) : (
        <>
          {isPredictionPage && (
          <section className="rounded-2xl border border-[color:var(--accent)]/25 bg-[linear-gradient(180deg,rgba(0,255,135,0.08),rgba(0,0,0,0.2))] p-4 shadow-[0_18px_70px_rgba(0,0,0,0.65)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="mb-2 inline-flex rounded-full border border-[color:var(--accent)]/35 bg-[color:var(--accent)]/10 px-3 py-1 text-[11px] font-semibold text-[color:var(--accent)]">
                  Pro 预测池
                </div>
                <h2 className="text-lg font-semibold">单场预测推荐</h2>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-white/55">
                  只有加入预测池的比赛会扣积分。系统读取设置页偏好，再按每场比赛独立给出主看方向、关注市场和建议占比。
                </p>
                {detailLoading && (
                  <p className="mt-2 text-[11px] text-amber-200/80">
                    正在读取预测池比赛的市场线和模型数据...
                  </p>
                )}
              </div>

              {!isPro && firstPredictionMatchId && (
                <button
                  type="button"
                  onClick={openUpgrade}
                  className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-xs font-semibold text-black shadow-[0_0_28px_rgba(0,255,135,0.45)] hover:bg-emerald-300"
                >
                  开通 Pro
                </button>
              )}
            </div>

            <div className="mt-4 rounded-2xl border border-white/8 bg-black/25 p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-xs font-semibold text-white">开始本次预测</div>
                  <p className="mt-1 text-[11px] leading-5 text-white/50">
                    当前预测池 {predictionPoolMatches.length} 场，每场扣 {PREDICTION_CREDITS_PER_MATCH} 预测积分，合计扣 {predictionCost} 分。
                    预测完成后，系统会直接给出每场单场建议，并把快照保存到历史预测。
                  </p>
                  {isPro && missingPredictionCredits > 0 && predictionPoolMatches.length > 0 && (
                    <p className="mt-1 text-[11px] font-semibold text-amber-200">
                      还需要 {missingPredictionCredits} 预测积分，可预测当前预测池 {predictionPoolMatches.length} 场比赛。
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleStartPrediction}
                  disabled={
                    predictionPoolMatches.length === 0 || predictionSubmitting || predictionStarted
                  }
                  className="rounded-full bg-[color:var(--accent)] px-5 py-2 text-xs font-black text-black shadow-[0_0_28px_rgba(0,255,135,0.45)] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {startPredictionButtonLabel}
                </button>
              </div>
              {predictionMessage && (
                <div
                  aria-live="polite"
                  className="mt-3 rounded-xl border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/10 px-3 py-2 text-xs text-[color:var(--accent)]"
                >
                  {predictionMessage}
                </div>
              )}
              {predictionStarted && (
                <div className="mt-3 rounded-xl border border-[color:var(--accent)]/35 bg-[color:var(--accent)]/12 px-3 py-3">
                  <div className="text-sm font-semibold text-[color:var(--accent)]">
                    本次推荐已生成
                  </div>
                  <p className="mt-1 text-xs leading-5 text-white/58">
                    下方已经按预测池比赛逐场生成单场预测。市场线、阵容或实时数据不完整时，
                    系统会先按基础模型给出观察建议，并标记“待市场确认”。这次记录已进入历史预测，等赛果回来后再结算。
                  </p>
                </div>
              )}
              {!predictionStarted && isPro && predictionPoolMatches.length > 0 && (
                <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-2 text-xs text-white/45">
                  还没有开始本次预测。点击按钮后才会扣积分，并展开每场比赛的单场方向和关注市场。
                </div>
              )}
              {isPro && predictionPoolMatches.length === 0 && (
                <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-2 text-xs text-white/45">
                  预测池暂时为空。先从下方收藏列表或热门赛事里选择“加入预测池”。
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-[color:var(--accent)]/40 bg-black/25 p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--accent)]">
                      按设置页自动匹配
                    </div>
                    <div className="mt-2 text-xl font-semibold text-white">
                      逐场单场预测
                    </div>
                    <p className="mt-1 text-xs leading-5 text-white/52">
                      当前偏好是「{activeProfile.label}」，系统自动使用「{modeConfig.label}」口径。每场会按设置页勾选的市场单独计算，不把收藏比赛默认拿去做串关。
                    </p>
                  </div>
                  <div className="shrink-0 rounded-full bg-[color:var(--accent)]/10 px-3 py-1 text-xs font-semibold text-[color:var(--accent)]">
                    {predictionStarted ? `逐场已生成 ${singleMatchPredictions.length} 场` : "点击开始后生成"}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {visibleModels.map((model) => (
                    <span
                      key={model}
                      className="rounded-full border border-white/8 bg-black/25 px-2.5 py-1 text-[11px] text-white/55"
                    >
                      {model}
                    </span>
                  ))}
                  {visibleMarkets.map((market) => (
                    <span
                      key={market}
                      className="rounded-full border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/8 px-2.5 py-1 text-[11px] text-[color:var(--accent)]/80"
                    >
                      {market}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/22 p-3">
                <div className="text-xs font-semibold text-white">想改变推荐风格？</div>
                <p className="mt-2 text-[11px] leading-5 text-white/48">
                  去设置页切换风险偏好或关注市场即可。比如勾选大小球、让球、球队进球数后，单场预测会优先展示这些口径。
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href="/settings"
                    className="rounded-full border border-[color:var(--accent)]/45 bg-[color:var(--accent)]/10 px-3 py-1.5 text-xs font-semibold text-[color:var(--accent)] hover:bg-[color:var(--accent)] hover:text-black"
                  >
                    去设置修改
                  </Link>
                  {selectionTouched && (
                    <button
                      type="button"
                      onClick={resetPortfolio}
                      className="rounded-full border border-white/12 bg-black/30 px-3 py-1.5 text-xs font-semibold text-white/65 hover:text-white"
                    >
                      恢复系统推荐
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-xl bg-black/25 p-3">
                <div className="text-[11px] text-white/45">本次预测场次</div>
                <div className="mt-1 text-2xl font-semibold text-white">
                  {singleMatchPredictions.length}
                </div>
              </div>
              <div className="rounded-xl bg-black/25 p-3">
                <div className="text-[11px] text-white/45">主看候选</div>
                <div className="mt-1 text-2xl font-semibold text-[color:var(--accent)]">
                  {singleMatchPredictions.filter((item) => item.pick.worthWatching).length}
                </div>
              </div>
              <div className="rounded-xl bg-black/25 p-3">
                <div className="text-[11px] text-white/45">关注市场</div>
                <div className="mt-1 text-2xl font-semibold text-white">
                  {activePrefs.preferred_markets.length}
                </div>
              </div>
              <div className="rounded-xl bg-[color:var(--accent)]/10 p-3">
                <div className="text-[11px] text-[color:var(--accent)]/70">剩余预测积分</div>
                <div className="mt-1 text-2xl font-semibold text-[color:var(--accent)]">
                  {predictionCredits ?? "-"}
                </div>
                <div className="mt-1 text-[11px] text-white/45">
                  每场预测扣 {PREDICTION_CREDITS_PER_MATCH} 分
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/8 bg-black/25 p-3 text-xs leading-6 text-white/55">
              <span className="font-semibold text-[color:var(--accent)]">单场建议：</span>
              {selectedPicks.length === 0
                ? "预测池里暂时没有足够强的信号，建议先观察，不强行给主看方向。"
                : `已给出 ${selectedPicks.length} 场主看候选。每场都按单场独立判断，建议占比只代表本次预测里不同比赛的相对优先级。`}
            </div>
            <div className="mt-3 rounded-xl border border-white/8 bg-black/20 p-3 text-xs leading-6 text-white/50">
              <span className="font-semibold text-white/75">分析口径：</span>
              先读取设置页的风险偏好、模型和关注市场，再对每场比赛分别计算模型公平指数、市场隐含概率和价值差。市场指数更新后才按“模型高于市场”给价值分；没有市场数据时只显示待市场确认，避免把基础估算当成正式建议。
            </div>

            {!predictionStarted && predictionPoolMatches.length > 0 && (
              <div className="mt-4 grid gap-3">
                {predictionPoolMatches.map((match) => (
                  <div
                    key={match.id}
                    className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-black/22 p-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--accent)]/80">
                        {translateLeague(match.league)}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-white">
                        {translateTeam(match.homeTeam)}{" "}
                        <span className="text-xs text-white/40">vs</span>{" "}
                        {translateTeam(match.awayTeam)}
                      </div>
                      <div className="mt-1 text-[11px] text-white/48">
                        {statusLabel[match.status]} · {match.kickOff}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFromPredictionPool(match.id)}
                      className="w-fit rounded-full border border-red-400/25 bg-red-500/8 px-3 py-1 text-[11px] text-red-200 hover:bg-red-500/14"
                    >
                      移出预测池
                    </button>
                  </div>
                ))}
              </div>
            )}

            {predictionStarted && singleMatchPredictions.length > 0 && (
              <div className={`mt-4 grid gap-3 ${isPro ? "" : "opacity-70"}`}>
                {singleMatchPredictions.map((item) => {
                const {
                  match,
                  pick,
                  signals,
                  selected,
                  suggestedPercent,
                  marketCount,
                  predictedScore,
                  expectedGoalsLabel,
                } = item;
                const visibleSignals = signals.length > 0 ? signals : [];
                return (
                  <div
                    key={match.id}
                    className={`rounded-2xl border p-3 transition ${
                      selected
                        ? "border-[color:var(--accent)]/55 bg-[color:var(--accent)]/10"
                        : "border-white/8 bg-black/22"
                    }`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-black/35 px-2 py-0.5 text-[11px] text-[color:var(--accent)]">
                            优先级 {pick.grade} · 推荐分 {pick.score}
                          </span>
                          <span className="rounded-full bg-black/35 px-2 py-0.5 text-[11px] text-white/60">
                            {pick.portfolioBucket}
                          </span>
                          <span className="rounded-full bg-black/35 px-2 py-0.5 text-[11px] text-white/60">
                            {portfolioRoleLabel(pick.role)} · 信号强度 {pick.confidence}%
                          </span>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${portfolioRiskClass(pick.riskLabel)}`}>
                            波动 {pick.riskLabel}
                          </span>
                          <span className="text-[11px] text-white/45">
                            {statusLabel[match.status]} · {match.kickOff}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveFromPredictionPool(match.id)}
                            className="rounded-full border border-red-400/25 bg-red-500/8 px-2 py-0.5 text-[11px] text-red-200 hover:bg-red-500/14"
                          >
                            移出预测池
                          </button>
                        </div>
                        <div className="mt-2 text-sm font-semibold text-white">
                          {translateTeam(match.homeTeam)}{" "}
                          <span className="text-xs text-white/40">vs</span>{" "}
                          {translateTeam(match.awayTeam)}
                        </div>
                        <div className="mt-1 text-[11px] text-white/45">
                          {translateLeague(match.league)}
                        </div>
                      </div>

                      <div className="grid gap-2 text-xs md:min-w-[640px] md:grid-cols-5">
                        <div className="rounded-xl bg-black/25 p-2">
                          <div className="text-white/42">主看市场</div>
                          <div className="mt-1 font-semibold text-white">{pick.market}</div>
                        </div>
                        <div className="rounded-xl bg-black/25 p-2">
                          <div className="text-white/42">单场方向</div>
                          <div className="mt-1 font-semibold text-white">{pick.direction}</div>
                        </div>
                        <div className="rounded-xl bg-black/25 p-2">
                          <div className="text-white/42">预测比分</div>
                          <div className="mt-1 font-semibold text-white">{predictedScore}</div>
                        </div>
                        <div className="rounded-xl bg-black/25 p-2">
                          <div className="text-white/42">建议占比</div>
                          <div className="mt-1 font-semibold text-[color:var(--accent)]">
                            {pick.worthWatching && selected
                              ? `${formatPercent(suggestedPercent)}%`
                              : "观望"}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!isPro || !predictionStarted || !pick.worthWatching}
                          onClick={() => togglePortfolioMatch(match.id)}
                          className={`rounded-xl border px-3 py-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            selected
                              ? "border-red-400/35 bg-red-500/10 text-red-200"
                              : "border-[color:var(--accent)]/35 bg-[color:var(--accent)]/10 text-[color:var(--accent)] hover:bg-[color:var(--accent)] hover:text-black"
                          }`}
                        >
                          {!isPro
                            ? "Pro 解锁后选择"
                            : !predictionStarted
                              ? "开始后可调整"
                              : selected
                                ? "取消主看"
                                : "设为主看"}
                        </button>
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-white/50">{pick.reason}</p>
                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                      <div className="rounded-xl bg-black/25 p-2 text-xs">
                        <div className="text-white/40">预期进球</div>
                        <div className="mt-1 font-semibold text-white">{expectedGoalsLabel}</div>
                      </div>
                      <div className="rounded-xl bg-black/25 p-2 text-xs">
                        <div className="text-white/40">市场参考</div>
                        <div className="mt-1 font-semibold text-white">{pick.oddsLabel}</div>
                      </div>
                      <div className="rounded-xl bg-black/25 p-2 text-xs">
                        <div className="text-white/40">设置页市场</div>
                        <div className="mt-1 font-semibold text-white">
                          {marketCount} 个市场参与筛选
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl border border-white/8 bg-black/18 p-3">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                        Market Signals
                      </div>
                      {visibleSignals.length > 0 ? (
                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {visibleSignals.map((signal) => {
                            const tone = signalTone(signal);
                            return (
                              <div
                                key={`${match.id}-${signal.market}-${signal.direction}`}
                                className={`rounded-xl border p-2.5 ${tone.className}`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="text-[11px] opacity-70">{signal.market}</div>
                                    <div className="mt-1 text-xs font-semibold">{signal.direction}</div>
                                  </div>
                                  <span className="rounded-full bg-black/25 px-2 py-0.5 text-[10px]">
                                    {tone.label}
                                  </span>
                                </div>
                                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                                  <div>
                                    <span className="opacity-60">模型概率</span>
                                    <div className="font-semibold">{formatSignalProbability(signal)}</div>
                                  </div>
                                  <div>
                                    <span className="opacity-60">价值判断</span>
                                    <div className="font-semibold">{signal.valueLabel}</div>
                                  </div>
                                </div>
                                <div className="mt-2 text-[10px] leading-4 opacity-65">{signal.oddsLabel}</div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-3 text-xs text-white/45">
                          设置页暂未选择市场，系统会用默认胜平负和大小球做基础观察。
                        </div>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {pick.dataBasis.map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-white/8 bg-black/20 px-2 py-0.5 text-[10px] text-white/42"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
              </div>
            )}
          </section>
          )}

          {!isPredictionPage && (
          <section className="space-y-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">收藏监控</h2>
                <p className="mt-1 text-xs text-white/50">
                  这里的比赛只用于快速查看实时数据和异常提醒；需要预测时再单独加入预测池。
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] text-white/55">
                收藏 {favoriteMatches.length} 场 · 预测池 {predictionPoolMatches.length} 场
              </div>
            </div>
            {favoriteMatches.map((match) => (
              <div
                key={match.id}
                className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-[color:var(--card)]/80 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.6)] md:flex-row md:items-center"
              >
                <Link
                  href={`/match/${match.id}`}
                  className="flex flex-1 items-center justify-between gap-4"
                >
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--accent)]/80">
                      {translateLeague(match.league)}
                    </div>
                    <div className="mt-1 text-sm text-white">
                      {translateTeam(match.homeTeam)}{" "}
                      <span className="text-xs text-white/40">vs</span>{" "}
                      {translateTeam(match.awayTeam)}
                    </div>
                    <div className="mt-1 text-[11px] text-white/50">
                      {statusLabel[match.status]} · {match.kickOff}
                      {match.status === "live" && match.minute && (
                        <span className="ml-2 text-red-400">{match.minute}&apos;</span>
                      )}
                    </div>
                  </div>
                  <div className="text-lg font-semibold">
                    {match.homeScore}
                    <span className="mx-1 text-xs text-white/40">:</span>
                    {match.awayScore}
                  </div>
                </Link>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleTogglePredictionPool(match)}
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                      predictionPoolIds.includes(match.id)
                        ? "border-[color:var(--accent)]/45 bg-[color:var(--accent)]/12 text-[color:var(--accent)]"
                        : "border-white/15 bg-black/40 text-white/70 hover:border-[color:var(--accent)]/55 hover:text-[color:var(--accent)]"
                    }`}
                  >
                    {predictionPoolIds.includes(match.id) ? "已加入预测池" : "加入预测池"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUnfavorite(match.id)}
                    className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[11px] text-white/70 hover:border-red-400/60 hover:text-red-300"
                  >
                    取消收藏
                  </button>
                </div>
              </div>
            ))}
            {favoriteMatches.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/12 bg-black/20 p-5 text-xs text-white/50">
                暂无收藏比赛。收藏后可用于实时提醒，不会自动扣预测积分。
              </div>
            )}
          </section>
          )}
        </>
      )}
      <ProPurchaseDialog
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        email={user?.email ?? membership.email}
        accessToken={session?.access_token}
        defaultPlanId={isPro ? "renewal" : "trial"}
      />
    </div>
  );
}
