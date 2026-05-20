"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { calculateHotScore } from "@/lib/hot-score";
import { translateLeague, translateTeam } from "@/lib/league-translations";
import {
  Membership,
  PRO_MONTHLY_PRICE_CNY,
  freeMembership,
} from "@/lib/membership";
import { defaultPreferenceValues, RiskLevel } from "@/lib/preference-options";
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
  riskLabel: "低" | "中" | "高";
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

function teamSignal(team: string) {
  const highSignalTeams = [
    "曼城",
    "阿森纳",
    "利物浦",
    "皇马",
    "巴塞罗那",
    "拜仁",
    "巴黎",
    "国际米兰",
    "AC 米兰",
    "Manchester City",
    "Arsenal",
    "Liverpool",
    "Real Madrid",
    "Barcelona",
    "Bayern Munich",
    "Paris Saint-Germain",
    "Inter",
    "AC Milan",
  ];

  return highSignalTeams.some((name) => team.includes(name)) ? 1 : 0;
}

function favoredSide(match: MatchCard) {
  if (match.status === "live" && match.homeScore !== match.awayScore) {
    return match.homeScore > match.awayScore ? "主队" : "客队";
  }

  const homeSignal = teamSignal(match.homeTeam);
  const awaySignal = teamSignal(match.awayTeam);
  if (homeSignal !== awaySignal) return homeSignal > awaySignal ? "主队" : "客队";
  return "主队";
}

function buildDataBasis(match: MatchCard, prefs: UserPrefs) {
  const basis = ["收藏池", "赛程时间", "联赛权重", "球队关注度"];
  if (match.status === "live") basis.push("实时比分");
  if (prefs.preferred_models.includes("凯利风控")) basis.push("模拟风控");
  if (prefs.preferred_models.includes("爆冷检测")) basis.push("冷门检查");
  return basis;
}

function buildDirection(match: MatchCard, mode: PortfolioMode, prefs: UserPrefs, score: number) {
  const side = favoredSide(match);

  if (match.status === "live" && Math.abs(match.homeScore - match.awayScore) <= 1) {
    return mode === "opportunity" ? "实时进球数机会" : `${side}低波动观察`;
  }

  if (mode === "stable") {
    return prefs.preferred_markets.includes("双重机会")
      ? `${side}不败方向`
      : `${side}低波动方向`;
  }

  if (mode === "opportunity") {
    if (prefs.preferred_markets.includes("让球") && score >= 72) return `${side}让球观察`;
    if (prefs.preferred_markets.includes("双方进球")) return "双方进球机会";
    return prefs.preferred_markets.includes("大小球") ? "进球数机会" : "冷门机会观察";
  }

  if (prefs.preferred_markets.includes("胜平负") && score >= 70) return `${side}胜平负方向`;
  if (prefs.preferred_markets.includes("大小球")) return "大小球方向";
  return "主流市场方向";
}

function buildMarket(mode: PortfolioMode, prefs: UserPrefs, score: number) {
  if (mode === "stable") {
    if (prefs.preferred_markets.includes("双重机会")) return "双重机会";
    if (prefs.preferred_markets.includes("平局退款")) return "平局退款";
    return "低波动市场";
  }

  if (mode === "opportunity") {
    if (prefs.preferred_markets.includes("让球") && score >= 72) return "让球 / 亚洲让球";
    if (prefs.preferred_markets.includes("双方进球")) return "双方进球";
    if (prefs.preferred_markets.includes("比分")) return "比分观察";
    return "大小球";
  }

  if (prefs.preferred_markets.includes("胜平负")) return "胜平负";
  if (prefs.preferred_markets.includes("大小球")) return "大小球";
  return "双重机会";
}

function buildReason(match: MatchCard, score: number, mode: PortfolioMode, confidence: number) {
  if (match.status === "finished") return "比赛已结束，只保留复盘价值，不进入组合。";
  if (match.status === "live") {
    return Math.abs(match.homeScore - match.awayScore) <= 1
      ? "实时比分仍接近，保留组合观察价值；临场数据接入后会继续校准。"
      : "比分差距已经拉开，模型会降低组合权重，避免追高。";
  }
  if (score >= 74) {
    return `收藏池里信号较强，当前置信度 ${confidence}%，适合作为组合核心候选。`;
  }
  if (score >= 62) {
    return "信息量够用，适合作为分散场次；不建议把模拟积分集中在这一场。";
  }
  return mode === "opportunity"
    ? "信号偏弱，只能作为小比例机会观察，等盘口和阵容数据确认。"
    : "当前信号不够强，优先放在观察区，不强行纳入组合。";
}

function buildPortfolioPick(
  match: MatchCard,
  mode: PortfolioMode,
  prefs: UserPrefs
): PortfolioPick {
  const modeConfig = portfolioModes.find((item) => item.id === mode) ?? portfolioModes[1];
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
  const score = clamp(
    hotScore + timingBoost + statusPenalty + livePenalty + modelBoost + marketBoost + modeAdjustment,
    0,
    100
  );
  const grade = score >= 74 ? "A" : score >= 62 ? "B" : "C";
  const volatility =
    (mode === "opportunity" ? 18 : mode === "balanced" ? 10 : 5) +
    (match.status === "live" ? 8 : 0) +
    (hoursUntil > 72 ? 6 : 0);
  const confidence = clamp(Math.round(score - volatility * 0.35), 35, 88);
  const worthWatching = score >= modeConfig.minScore && match.status !== "finished";
  const cap = riskCapPercent[prefs.risk_level];
  const rawPercent = ((score - 48) / 52) * cap * modeConfig.multiplier;
  const maxSinglePercent = mode === "stable" ? cap * 0.42 : mode === "balanced" ? cap * 0.5 : cap * 0.55;
  const exposurePercent = worthWatching ? clamp(rawPercent, 0.6, maxSinglePercent) : 0;
  const riskLabel = volatility >= 22 || score < 60 ? "高" : volatility >= 13 ? "中" : "低";
  const role = !worthWatching
    ? "观察"
    : score >= 74
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
    market: buildMarket(mode, prefs, score),
    direction: buildDirection(match, mode, prefs, score),
    reason: buildReason(match, score, mode, confidence),
    riskLabel,
    dataBasis: buildDataBasis(match, prefs),
    exposurePercent,
    exposurePoints: Math.round((prefs.capital * exposurePercent) / 100),
    worthWatching,
  };
}

function buildPortfolioPlan(
  matches: MatchCard[],
  mode: PortfolioMode,
  prefs: UserPrefs
): PortfolioPlan {
  const config = portfolioModes.find((item) => item.id === mode) ?? portfolioModes[1];
  const picks = matches
    .map((match) => buildPortfolioPick(match, mode, prefs))
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
  const [membership, setMembership] = useState<Membership>(() => freeMembership());
  const [userPrefs, setUserPrefs] = useState<UserPrefs | null>(null);
  const [portfolioMode, setPortfolioMode] = useState<PortfolioMode>("balanced");
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

  const portfolioPlans = useMemo(
    () =>
      portfolioModes.map((mode) =>
        buildPortfolioPlan(favoriteMatches, mode.id, activePrefs)
      ),
    [activePrefs, favoriteMatches]
  );
  const activePlan =
    portfolioPlans.find((plan) => plan.mode === portfolioMode) ??
    portfolioPlans[1] ??
    buildPortfolioPlan([], "balanced", activePrefs);
  const portfolioPicks = activePlan.picks;
  const modeConfig = portfolioModes.find((item) => item.id === portfolioMode) ?? portfolioModes[1];
  const singleBestPick = portfolioPlans
    .flatMap((plan) => plan.picks)
    .sort((a, b) => b.score - a.score)[0];
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
            先在热门赛事里点“加入组合池”，Pro 会在这里筛选收藏比赛并生成模拟组合参考。
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
                  先给每场做单场评分，再按稳健、均衡、机会三种思路组合；赔率、历史和球员数据接入后会进入同一套评分入口。
                </p>
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
                      {singleBestPick.direction} · 置信度 {singleBestPick.confidence}% ·{" "}
                      {singleBestPick.reason}
                    </div>
                  </div>
                  <div className="grid shrink-0 grid-cols-3 gap-2 text-xs">
                    <div className="rounded-xl bg-black/35 px-3 py-2">
                      <div className="text-white/40">市场</div>
                      <div className="mt-1 font-semibold text-white">{singleBestPick.market}</div>
                    </div>
                    <div className="rounded-xl bg-black/35 px-3 py-2">
                      <div className="text-white/40">风险</div>
                      <div className="mt-1 font-semibold text-white">{singleBestPick.riskLabel}</div>
                    </div>
                    <div className="rounded-xl bg-[color:var(--accent)]/10 px-3 py-2">
                      <div className="text-[color:var(--accent)]/70">模拟</div>
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

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {portfolioPlans.map((plan) => (
                <button
                  key={plan.mode}
                  type="button"
                  onClick={() => {
                    setPortfolioMode(plan.mode);
                    resetPortfolio();
                  }}
                  className={`rounded-2xl border p-3 text-left transition ${
                    portfolioMode === plan.mode
                      ? "border-[color:var(--accent)]/75 bg-[color:var(--accent)]/12 text-white"
                      : "border-white/10 bg-black/25 text-white/65 hover:border-white/20 hover:text-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{plan.label}</span>
                    <span className="rounded-full bg-black/35 px-2 py-0.5 text-[11px] text-[color:var(--accent)]">
                      {plan.selectedIds.length} 场
                    </span>
                  </div>
                  <div className="mt-2 text-xl font-semibold">{plan.headline}</div>
                  <div className="mt-1 text-[11px] leading-5 text-white/48">{plan.summary}</div>
                  <div className="mt-2 text-[11px] text-white/45">
                    约 {formatPercent(plan.totalExposurePercent)}% · {plan.totalExposurePoints} 模拟积分
                  </div>
                </button>
              ))}
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
                : `${activePlan.headline}：${modeConfig.description} 已选 ${selectedPicks.length} 场，总模拟比例 ${formatPercent(
                    totalExposurePercent
                  )}%。优先分散到不同比赛，不把模拟积分集中在单一场次。`}
            </div>
            <div className="mt-3 rounded-xl border border-white/8 bg-black/20 p-3 text-xs leading-6 text-white/50">
              <span className="font-semibold text-white/75">分析口径：</span>
              当前先用收藏池、赛程、联赛权重、球队热度和风险偏好生成单场评分；详情页有真实赔率时会用欧赔胜平负做去水校准。后续实时盘口、历史战绩和球员数据接入后，会重新计算置信度和组合比例。
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
                            {pick.grade} 级 · {pick.score} 分
                          </span>
                          <span className="rounded-full bg-black/35 px-2 py-0.5 text-[11px] text-white/60">
                            {pick.role} · 置信度 {pick.confidence}%
                          </span>
                          <span className="rounded-full bg-black/35 px-2 py-0.5 text-[11px] text-white/60">
                            风险 {pick.riskLabel}
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

                      <div className="grid gap-2 text-xs md:min-w-[360px] md:grid-cols-3">
                        <div className="rounded-xl bg-black/25 p-2">
                          <div className="text-white/42">参考市场</div>
                          <div className="mt-1 font-semibold text-white">{pick.market}</div>
                        </div>
                        <div className="rounded-xl bg-black/25 p-2">
                          <div className="text-white/42">参考方向</div>
                          <div className="mt-1 font-semibold text-white">{pick.direction}</div>
                        </div>
                        <div className="rounded-xl bg-black/25 p-2">
                          <div className="text-white/42">模拟比例</div>
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
