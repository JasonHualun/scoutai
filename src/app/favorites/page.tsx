"use client";

import Image from "next/image";
import Link from "next/link";
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
  PRO_MONTHLY_PRICE_CNY,
  freeMembership,
} from "@/lib/membership";
import { defaultPreferenceValues, RiskLevel, riskProfiles } from "@/lib/preference-options";
import { savePortfolioAllocation } from "@/lib/simulated-points";
import { supabase } from "@/lib/supabase";
import { formatBeijingMatchTime } from "@/lib/time-format";
import { useAuthStore } from "@/lib/authStore";

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
  portfolioBucket: "稳定主选" | "价值候选" | "爆冷小注" | "观察";
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

type UserPrefs = {
  risk_level: RiskLevel;
  capital: number;
  preferred_markets: string[];
  preferred_models: string[];
};

type PaymentApplication = {
  id: string;
  order_no: string;
  email: string;
  amount: number;
  currency: "CNY" | "USD";
  months: number;
  status: "pending" | "confirmed" | "rejected";
  created_at: string;
};

const FAVORITES_KEY = "scoutai_favorites";
const PRO_ORIGINAL_PRICE_CNY = "¥199";

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
    label: "稳健组合",
    description: "少选、分散、优先低波动方向。",
    size: 2,
    multiplier: 0.62,
    minScore: 66,
    maxSameLeague: 1,
  },
  {
    id: "balanced",
    label: "均衡组合",
    description: "兼顾单场强度、市场方向和分散度。",
    size: 3,
    multiplier: 0.9,
    minScore: 60,
    maxSameLeague: 2,
  },
  {
    id: "opportunity",
    label: "机会组合",
    description: "允许更高波动，只给小比例机会观察。",
    size: 4,
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
  else if (["FT", "AET", "PEN"].includes(statusShort)) status = "finished";

  return {
    id: fixture.fixture.id,
    leagueId: fixture.league.id,
    league: `${fixture.league.name} · ${fixture.league.round ?? ""}`.trim(),
    homeTeam: fixture.teams.home.name,
    awayTeam: fixture.teams.away.name,
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
    核心: "组合主选",
    分散: "分散备选",
    机会: "小比例机会",
    观察: "暂不纳入",
  }[role];
}

function portfolioRiskClass(label: PortfolioPick["riskLabel"]) {
  return {
    低波动: "border-emerald-300/18 bg-emerald-300/8 text-emerald-100",
    中等波动: "border-sky-300/18 bg-sky-300/8 text-sky-100",
    波动偏高: "border-amber-300/22 bg-amber-300/10 text-amber-100",
  }[label];
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

function createDraftOrderNo() {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PRO-${date}-${random}`;
}

function ProUpgradeDialog({
  open,
  onClose,
  email,
  orderNo,
  application,
  submitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  email?: string | null;
  orderNo: string;
  application: PaymentApplication | null;
  submitting: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-[color:var(--accent)]/25 bg-[#101513] p-5 shadow-[0_25px_90px_rgba(0,0,0,0.85)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--accent)]">
              Pro
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              开通 Pro 收藏组合
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/60">
              解锁收藏组合、模拟积分联动和更完整的盘口风控参考。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/60 hover:text-white"
          >
            关闭
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-xl border border-white/8 bg-black/25 p-3">
            <div className="text-xs font-semibold text-[color:var(--accent)]">
              新用户首月优惠
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <span className="pb-1 text-sm text-white/42 line-through">
                原价 {PRO_ORIGINAL_PRICE_CNY}/月
              </span>
              <span className="text-4xl font-semibold tracking-tight text-white">
                {PRO_MONTHLY_PRICE_CNY}
              </span>
              <span className="pb-1 text-sm text-white/65">首月体验</span>
            </div>

            <div className="mt-4 text-[11px] text-white/45">注册邮箱</div>
            <div className="mt-1 break-all text-sm font-semibold text-white">
              {email ?? "请先登录后再提交申请"}
            </div>
            <div className="mt-3 text-[11px] text-white/45">订单编号</div>
            <div className="mt-1 break-all rounded-lg bg-black/35 px-3 py-2 text-xs font-semibold text-[color:var(--accent)]">
              {application?.order_no ?? orderNo}
            </div>
            <div className="mt-3 rounded-lg border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/10 px-3 py-2 text-[11px] leading-5 text-[color:var(--accent)]">
              付款时如能填写备注，请填订单编号；付款后点下方按钮提交申请。
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/8 bg-black/25 p-3">
              <div className="mb-2 text-xs font-semibold text-white">微信支付</div>
              <Image
                src="/payments/wechat.jpg"
                alt="微信支付收款码"
                width={414}
                height={586}
                className="mx-auto h-64 w-full rounded-lg bg-white object-contain"
              />
            </div>
            <div className="rounded-xl border border-white/8 bg-black/25 p-3">
              <div className="mb-2 text-xs font-semibold text-white">支付宝</div>
              <Image
                src="/payments/alipay.jpg"
                alt="支付宝收款码"
                width={640}
                height={960}
                className="mx-auto h-64 w-full rounded-lg bg-white object-contain"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/8 bg-black/25 p-3 text-xs leading-6 text-white/58">
          <div>付款完成后，通常 30 分钟内人工开通。</div>
          <div>客服开通时间：每日 09:00 - 18:00。非工作时间付款会顺延处理。</div>
        </div>

        {application ? (
          <div className="mt-4 rounded-xl border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 px-3 py-2 text-xs leading-6 text-[color:var(--accent)]">
            付款申请已提交：{application.order_no}。管理员核对到账后会为 {application.email} 开通 Pro。
          </div>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || !email}
            className="mt-4 w-full rounded-full bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-black shadow-[0_0_28px_rgba(0,255,135,0.55)] hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "提交中..." : email ? "我已付款，提交开通申请" : "请先登录"}
          </button>
        )}

        {error && (
          <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function hoursUntilKickoff(match: MatchCard) {
  if (!match.date) return 999;
  return (new Date(match.date).getTime() - Date.now()) / 3_600_000;
}

function fairOddsFromProbability(probability: number) {
  return Math.round((100 / Math.max(probability, 1)) * 100) / 100;
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
  if ((offeredOdds ?? fairOdds) >= 3.2 && (edge ?? 0) >= 2) return "爆冷小注";
  if (probability >= 58 && fairOdds <= 1.85) return "稳定主选";
  if (edge != null && edge >= 3) return "价值候选";
  if (probability >= 52 && fairOdds <= 2.1) return "价值候选";
  return "观察";
}

function valueLabel(edge: number | null, hasRealOdds: boolean) {
  if (edge == null) {
    return hasRealOdds ? "盘口数据不足" : "待盘口确认";
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
          : `公平 ${signal.fairOdds.toFixed(2)} / 待盘口`,
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
      valueLabel: snapshot.hasRealOdds ? "缺少大小球赔率" : "待盘口确认",
      oddsLabel: `公平 ${fairOddsFromProbability(probability).toFixed(2)} / 待盘口`,
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
      valueLabel: snapshot.hasRealOdds ? "缺少双方进球赔率" : "待盘口确认",
      oddsLabel: `公平 ${fairOddsFromProbability(probability).toFixed(2)} / 待盘口`,
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
      oddsLabel: `公平 ${fairOddsFromProbability(best.probability).toFixed(2)} / 待盘口`,
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
      oddsLabel: `公平 ${fairOddsFromProbability(probability).toFixed(2)} / 待盘口`,
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
          : `公平 ${top.fairOdds.toFixed(2)} / 待盘口`,
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
      bucket: "爆冷小注",
      valueLabel: "高赔率小注",
      oddsLabel: "需真实比分赔率",
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
        : `公平 ${fallback.fairOdds.toFixed(2)} / 待盘口`,
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
      item.bucket === "稳定主选" ? 8 : item.bucket === "价值候选" ? 5 : item.bucket === "爆冷小注" ? 3 : 0;

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

function buildDataBasis(match: MatchCard, prefs: UserPrefs, snapshot: ModelSnapshot) {
  const basis = ["收藏池", "赛程时间", "联赛权重", "球队关注度"];
  if (match.status === "live") basis.push("实时比分");
  if (snapshot.hasRealOdds) basis.push("真实赔率");
  else basis.push("待盘口");
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
  if (match.status === "finished") return "比赛已结束，只保留复盘价值，不进入组合。";
  if (match.status === "live") {
    return Math.abs(match.homeScore - match.awayScore) <= 1
      ? "实时比分仍接近，保留组合观察价值；临场数据接入后会继续校准。"
      : "比分差距已经拉开，模型会降低组合权重，避免追高。";
  }
  if (!snapshot.hasRealOdds) {
    return `当前先按模型公平赔率筛选：${opportunity.direction}，${opportunity.valueLabel}。等真实盘口接入后，会用市场赔率重新计算价值差和模拟比例。`;
  }
  if (opportunity.bucket === "爆冷小注") {
    return `${opportunity.direction} 属于高赔率机会，${opportunity.valueLabel}；只适合小比例放进机会组合，不适合重仓。`;
  }
  if (opportunity.bucket === "稳定主选") {
    return `${opportunity.direction} 的模型概率更稳，${opportunity.valueLabel}；适合作为稳定组合的主选之一。`;
  }
  if (score >= 74) {
    return `收藏池里信号较强，当前信号强度 ${confidence}%，${opportunity.valueLabel}，适合作为组合主选候选。`;
  }
  if (score >= 62) {
    return `${opportunity.direction} 信息量够用，适合作为分散场次；不建议把模拟积分集中在这一场。`;
  }
  return mode === "opportunity"
    ? "信号偏弱，只能作为小比例机会观察，等盘口和阵容数据确认。"
    : "当前信号不够强，优先放在观察区，不强行纳入组合。";
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
      : opportunity.bucket === "爆冷小注"
        ? 0.42
        : opportunity.bucket === "价值候选"
          ? 0.82
          : 0.25;
  const oddsConfidenceMultiplier = snapshot.hasRealOdds ? 1 : 0.58;
  const rawPercent =
    ((score - 48) / 52) * cap * modeConfig.multiplier * bucketMultiplier * oddsConfidenceMultiplier;
  const maxSinglePercent =
    opportunity.bucket === "爆冷小注"
      ? cap * 0.22
      : opportunity.bucket === "稳定主选"
        ? cap * 0.58
        : mode === "balanced"
          ? cap * 0.46
          : cap * 0.38;
  const exposurePercent = worthWatching ? clamp(rawPercent, 0.6, maxSinglePercent) : 0;
  const riskLabel =
    opportunity.bucket === "爆冷小注"
      ? "波动偏高"
      : buildPortfolioRiskLabel(mode, score, hoursUntil, match.status);
  const role = !worthWatching
    ? "观察"
    : opportunity.bucket === "爆冷小注"
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
    .sort((a, b) => b.score - a.score || a.riskLabel.localeCompare(b.riskLabel));
  const selected: PortfolioPick[] = [];

  for (const pick of picks) {
    if (!pick.worthWatching) continue;
    const sameLeagueCount = selected.filter(
      (item) => item.match.leagueId === pick.match.leagueId
    ).length;
    if (sameLeagueCount >= config.maxSameLeague && selected.length < config.size - 1) continue;
    selected.push(pick);
    if (selected.length >= config.size) break;
  }

  if (selected.length === 0 && picks[0]?.score >= 58 && picks[0].match.status !== "finished") {
    selected.push({ ...picks[0], role: "观察", exposurePercent: 0, exposurePoints: 0 });
  }

  const totalExposurePercent = selected.reduce((sum, pick) => sum + pick.exposurePercent, 0);
  const totalExposurePoints = selected.reduce((sum, pick) => sum + pick.exposurePoints, 0);
  const label = config.label;
  const headline =
    selected.length <= 1
      ? "本期单场优先"
      : mode === "stable"
        ? "低波动分散"
        : mode === "opportunity"
          ? "小比例机会"
          : "均衡组合";
  const summary =
    selected.length <= 1
      ? "收藏池暂时没有足够多的强信号，不建议为了组合而组合。"
      : `${label} 选出 ${selected.length} 场，按不同比赛分散模拟积分，避免集中在单一场次。`;

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

export default function FavoritesPage() {
  const user = useAuthStore((state) => state.user);
  const session = useAuthStore((state) => state.session);

  const [favoriteMatches, setFavoriteMatches] = useState<MatchCard[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailByMatch, setDetailByMatch] = useState<Record<number, MatchDetailResponse>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [membership, setMembership] = useState<Membership>(() => freeMembership());
  const [userPrefs, setUserPrefs] = useState<UserPrefs | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectionTouched, setSelectionTouched] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [paymentOrderNo, setPaymentOrderNo] = useState("");
  const [paymentApplication, setPaymentApplication] = useState<PaymentApplication | null>(null);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const isPro = membership.plan === "pro" && membership.status === "active";
  const activePrefs = isPro && userPrefs ? userPrefs : defaultPrefs;

  useEffect(() => {
    async function load() {
      try {
        const raw = localStorage.getItem(FAVORITES_KEY);
        const ids: number[] = raw ? JSON.parse(raw) : [];
        setFavoriteIds(ids);

        if (ids.length === 0) return;

        const res = await fetch("/api/football/all");
        const json = (await res.json()) as { fixtures?: FixtureLike[] };

        if (Array.isArray(json.fixtures)) {
          const idSet = new Set(ids.map(String));
          setFavoriteMatches(
            json.fixtures
              .filter((fixture) => idSet.has(String(fixture.fixture.id)))
              .map(mapFixtureToMatchCard)
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
    if (favoriteMatches.length === 0) {
      setDetailByMatch({});
      return;
    }

    let cancelled = false;
    async function loadMatchDetails() {
      setDetailLoading(true);
      try {
        const results = await Promise.allSettled(
          favoriteMatches.slice(0, 12).map(async (match) => {
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
  }, [favoriteMatches]);

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
        if (!cancelled) setMembership(json.membership ?? freeMembership(user?.email));
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
        buildPortfolioPlan(favoriteMatches, mode.id, activePrefs, detailByMatch)
      ),
    [activePrefs, detailByMatch, favoriteMatches]
  );
  const activePlan = useMemo(
    () =>
      plansByMode.find((plan) => plan.mode === activePortfolioMode) ??
      buildPortfolioPlan(favoriteMatches, activePortfolioMode, activePrefs, detailByMatch),
    [activePortfolioMode, activePrefs, detailByMatch, favoriteMatches, plansByMode]
  );
  const portfolioPicks = activePlan.picks;
  const modeConfig =
    portfolioModes.find((item) => item.id === activePortfolioMode) ?? portfolioModes[1];
  const singleBestPick = portfolioPicks[0];
  const recommendedIds = activePlan.selectedIds;
  const activeSelectedIds = selectionTouched ? selectedIds : recommendedIds;
  const selectedSet = useMemo(() => new Set(activeSelectedIds), [activeSelectedIds]);
  const selectedPicks = useMemo(
    () => portfolioPicks.filter((pick) => selectedSet.has(pick.match.id)),
    [portfolioPicks, selectedSet]
  );
  const totalExposurePercent = selectedPicks.reduce(
    (sum, pick) => sum + pick.exposurePercent,
    0
  );
  const totalExposurePoints = selectedPicks.reduce(
    (sum, pick) => sum + pick.exposurePoints,
    0
  );
  const remainingPortfolioPoints = Math.max(0, activePrefs.capital - totalExposurePoints);
  const selectedMatchIdsKey = activeSelectedIds.join(",");
  const corePicks = activePlan.coreCount;
  const firstFavoriteMatchId = favoriteMatches[0]?.id;
  const isEmpty = !loading && favoriteMatches.length === 0;
  const activeProfile = riskProfiles[activePrefs.risk_level];
  const visibleModels = activePrefs.preferred_models.slice(0, 3);
  const visibleMarkets = activePrefs.preferred_markets.slice(0, 4);

  useEffect(() => {
    if (!isPro) return;

    savePortfolioAllocation({
      usedPoints: totalExposurePoints,
      totalPercent: totalExposurePercent,
      selectedMatchIds: selectedPicks.map((pick) => pick.match.id),
    });
  }, [isPro, selectedMatchIdsKey, selectedPicks, totalExposurePercent, totalExposurePoints]);

  function handleUnfavorite(id: number) {
    const updated = favoriteIds.filter((favoriteId) => favoriteId !== id);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
    setFavoriteIds(updated);
    setFavoriteMatches((prev) => prev.filter((match) => match.id !== id));
    setDetailByMatch((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSelectedIds((prev) => prev.filter((matchId) => matchId !== id));
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
    setPaymentError(null);
    setPaymentApplication(null);
    setPaymentOrderNo(createDraftOrderNo());
    setUpgradeOpen(true);
  }

  async function handleSubmitPaymentApplication() {
    if (!session) {
      setPaymentError("请先登录后再提交付款申请");
      return;
    }

    setPaymentSubmitting(true);
    setPaymentError(null);

    try {
      const res = await fetch("/api/payment-applications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ orderNo: paymentOrderNo || createDraftOrderNo(), months: 1 }),
      });

      const json = (await res.json()) as {
        application?: PaymentApplication;
        error?: string;
      };

      if (!res.ok) throw new Error(json.error ?? "提交付款申请失败");
      setPaymentApplication(json.application ?? null);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "提交付款申请失败");
    } finally {
      setPaymentSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">收藏</h1>
          <p className="mt-2 text-sm text-white/60">
            先在热门赛事里点“加入组合池”，这里会按设置页偏好自动筛选比赛并生成模拟组合参考。
          </p>
        </div>
        <div className="rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[11px] text-white/60">
          {isPro
            ? `${riskLabel(activePrefs.risk_level)} · ${activePrefs.capital} 模拟积分`
            : "当前为免费版"}
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-[color:var(--card)]/70 p-6 text-sm text-white/60">
          加载收藏中...
        </div>
      ) : isEmpty ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-[color:var(--card)]/60 p-6 text-sm text-white/60">
          <div className="mb-3 text-base text-white/75">暂无收藏比赛</div>
          <p className="mb-4 max-w-xl text-xs leading-5 text-white/55">
            去热门赛事页，把你想重点观察的比赛点“加入组合池”。收藏 2-4 场后，这里会生成组合参考和模拟比例。
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
          <section className="rounded-2xl border border-[color:var(--accent)]/25 bg-[linear-gradient(180deg,rgba(0,255,135,0.08),rgba(0,0,0,0.2))] p-4 shadow-[0_18px_70px_rgba(0,0,0,0.65)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="mb-2 inline-flex rounded-full border border-[color:var(--accent)]/35 bg-[color:var(--accent)]/10 px-3 py-1 text-[11px] font-semibold text-[color:var(--accent)]">
                  Pro 收藏组合
                </div>
                <h2 className="text-lg font-semibold">收藏组合推演</h2>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-white/55">
                  不在收藏页重复选模型。系统会读取设置页偏好，再逐场拉取赔率、统计和近况；有真实盘口时按价值差分组，没有盘口时只做赛前观察。
                </p>
                {detailLoading && (
                  <p className="mt-2 text-[11px] text-amber-200/80">
                    正在读取收藏比赛的盘口和模型数据...
                  </p>
                )}
              </div>

              {!isPro && firstFavoriteMatchId && (
                <button
                  type="button"
                  onClick={openUpgrade}
                  className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-xs font-semibold text-black shadow-[0_0_28px_rgba(0,255,135,0.45)] hover:bg-emerald-300"
                >
                  开通 Pro
                </button>
              )}
            </div>

            {singleBestPick && (
              <div className="mt-4 rounded-2xl border border-[color:var(--accent)]/25 bg-black/25 p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--accent)]">
                      Single First
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      单场优先：{translateTeam(singleBestPick.match.homeTeam)} vs{" "}
                      {translateTeam(singleBestPick.match.awayTeam)}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-white/52">
                      {singleBestPick.direction} · 信号强度 {singleBestPick.confidence}% ·{" "}
                      {singleBestPick.reason}
                    </div>
                  </div>
                  <div className="grid shrink-0 grid-cols-3 gap-2 text-xs">
                    <div className="rounded-xl bg-black/35 px-3 py-2">
                      <div className="text-white/40">关注玩法</div>
                      <div className="mt-1 font-semibold text-white">{singleBestPick.market}</div>
                    </div>
                    <div className="rounded-xl bg-black/35 px-3 py-2">
                      <div className="text-white/40">价值差</div>
                      <div className="mt-1 font-semibold text-white">{singleBestPick.valueLabel}</div>
                    </div>
                    <div className="rounded-xl bg-[color:var(--accent)]/10 px-3 py-2">
                      <div className="text-[color:var(--accent)]/70">建议占比</div>
                      <div className="mt-1 font-semibold text-[color:var(--accent)]">
                        {singleBestPick.worthWatching
                          ? `${formatPercent(singleBestPick.exposurePercent)}%`
                          : "观望"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-[color:var(--accent)]/40 bg-black/25 p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--accent)]">
                      按设置页自动匹配
                    </div>
                    <div className="mt-2 text-xl font-semibold text-white">
                      {activePlan.headline}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-white/52">
                      当前偏好是「{activeProfile.label}」，系统自动使用「{modeConfig.label}」口径。{modeConfig.description}
                    </p>
                  </div>
                  <div className="shrink-0 rounded-full bg-[color:var(--accent)]/10 px-3 py-1 text-xs font-semibold text-[color:var(--accent)]">
                    自动推荐 {activePlan.selectedIds.length} 场
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
                  去设置页切换风险偏好即可。保守型会偏低波动，稳健型会平衡单场和组合，进取型会多看机会方向。
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

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {plansByMode.map((plan) => {
                const planSelected = plan.picks.filter((pick) =>
                  plan.selectedIds.includes(pick.match.id)
                );
                const topBucket = planSelected[0]?.portfolioBucket ?? "观察";
                return (
                  <div
                    key={plan.mode}
                    className={`rounded-2xl border p-3 ${
                      plan.mode === activePortfolioMode
                        ? "border-[color:var(--accent)]/45 bg-[color:var(--accent)]/10"
                        : "border-white/8 bg-black/22"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-white">{plan.label}</div>
                        <div className="mt-1 text-[11px] text-white/45">
                          {topBucket} · {plan.selectedIds.length} 场
                        </div>
                      </div>
                      <div className="rounded-full bg-black/35 px-2 py-1 text-[11px] text-[color:var(--accent)]">
                        {formatPercent(plan.totalExposurePercent)}%
                      </div>
                    </div>
                    <p className="mt-3 text-[11px] leading-5 text-white/50">{plan.summary}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-5">
              <div className="rounded-xl bg-black/25 p-3">
                <div className="text-[11px] text-white/45">可组合场次</div>
                <div className="mt-1 text-2xl font-semibold text-white">
                  {portfolioPicks.filter((pick) => pick.worthWatching).length}
                </div>
              </div>
              <div className="rounded-xl bg-black/25 p-3">
                <div className="text-[11px] text-white/45">核心候选</div>
                <div className="mt-1 text-2xl font-semibold text-[color:var(--accent)]">
                  {corePicks}
                </div>
              </div>
              <div className="rounded-xl bg-black/25 p-3">
                <div className="text-[11px] text-white/45">已选组合</div>
                <div className="mt-1 text-2xl font-semibold text-white">
                  {selectedPicks.length}
                </div>
              </div>
              <div className="rounded-xl bg-black/25 p-3">
                <div className="text-[11px] text-white/45">组合总模拟</div>
                <div className="mt-1 text-2xl font-semibold text-white">
                  {formatPercent(totalExposurePercent)}%
                </div>
                <div className="mt-1 text-[11px] text-white/45">
                  约 {totalExposurePoints} 模拟积分
                </div>
              </div>
              <div className="rounded-xl bg-[color:var(--accent)]/10 p-3">
                <div className="text-[11px] text-[color:var(--accent)]/70">剩余模拟积分</div>
                <div className="mt-1 text-2xl font-semibold text-[color:var(--accent)]">
                  {remainingPortfolioPoints}
                </div>
                <div className="mt-1 text-[11px] text-white/45">
                  与设置页联动
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/8 bg-black/25 p-3 text-xs leading-6 text-white/55">
              <span className="font-semibold text-[color:var(--accent)]">组合建议：</span>
              {selectedPicks.length === 0
                ? "收藏里暂时没有足够强的信号，建议先观察，不强行组合。"
                : `${activePlan.headline}：稳定主选会给更高模拟比例，爆冷或高赔率方向只保留小注观察。已选 ${selectedPicks.length} 场，总模拟比例 ${formatPercent(
                    totalExposurePercent
                  )}%。优先分散到不同比赛，不把模拟积分集中在单一场次。`}
            </div>
            <div className="mt-3 rounded-xl border border-white/8 bg-black/20 p-3 text-xs leading-6 text-white/50">
              <span className="font-semibold text-white/75">分析口径：</span>
              组合先读取用户设置的风险偏好、模型和关注市场，再逐场计算模型公平赔率、市场赔率去水概率和价值差。有真实盘口时才按“模型高于市场”给价值分；没有盘口时只显示待盘口确认，不当作真实投注信号。
            </div>

            <div className={`mt-4 grid gap-3 ${isPro ? "" : "opacity-70"}`}>
              {portfolioPicks.map((pick) => {
                const selected = selectedSet.has(pick.match.id);
                return (
                  <div
                    key={pick.match.id}
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
                            {statusLabel[pick.match.status]} · {pick.match.kickOff}
                          </span>
                        </div>
                        <div className="mt-2 text-sm font-semibold text-white">
                          {translateTeam(pick.match.homeTeam)}{" "}
                          <span className="text-xs text-white/40">vs</span>{" "}
                          {translateTeam(pick.match.awayTeam)}
                        </div>
                        <div className="mt-1 text-[11px] text-white/45">
                          {translateLeague(pick.match.league)}
                        </div>
                      </div>

                      <div className="grid gap-2 text-xs md:min-w-[640px] md:grid-cols-5">
                        <div className="rounded-xl bg-black/25 p-2">
                          <div className="text-white/42">关注玩法</div>
                          <div className="mt-1 font-semibold text-white">{pick.market}</div>
                        </div>
                        <div className="rounded-xl bg-black/25 p-2">
                          <div className="text-white/42">模型方向</div>
                          <div className="mt-1 font-semibold text-white">{pick.direction}</div>
                        </div>
                        <div className="rounded-xl bg-black/25 p-2">
                          <div className="text-white/42">赔率参考</div>
                          <div className="mt-1 font-semibold text-white">{pick.oddsLabel}</div>
                        </div>
                        <div className="rounded-xl bg-black/25 p-2">
                          <div className="text-white/42">建议占比</div>
                          <div className="mt-1 font-semibold text-[color:var(--accent)]">
                            {pick.worthWatching ? `${formatPercent(pick.exposurePercent)}%` : "观望"}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!isPro || !pick.worthWatching}
                          onClick={() => togglePortfolioMatch(pick.match.id)}
                          className={`rounded-xl border px-3 py-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            selected
                              ? "border-red-400/35 bg-red-500/10 text-red-200"
                              : "border-[color:var(--accent)]/35 bg-[color:var(--accent)]/10 text-[color:var(--accent)] hover:bg-[color:var(--accent)] hover:text-black"
                          }`}
                        >
                          {!isPro ? "Pro 解锁后选择" : selected ? "移出组合" : "加入组合"}
                        </button>
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-white/50">{pick.reason}</p>
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
          </section>

          <div className="space-y-3">
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
                <button
                  type="button"
                  onClick={() => handleUnfavorite(match.id)}
                  className="shrink-0 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[11px] text-white/70 hover:border-red-400/60 hover:text-red-300"
                >
                  取消收藏
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      <ProUpgradeDialog
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        email={user?.email ?? membership.email}
        orderNo={paymentOrderNo}
        application={paymentApplication}
        submitting={paymentSubmitting}
        error={paymentError}
        onSubmit={handleSubmitPaymentApplication}
      />
    </div>
  );
}
