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
  grade: "A" | "B" | "C";
  direction: string;
  reason: string;
  exposurePercent: number;
  exposurePoints: number;
  worthWatching: boolean;
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
}> = [
  {
    id: "stable",
    label: "低波动组合",
    description: "优先少选、分散，适合只看更稳的方向。",
    size: 2,
    multiplier: 0.68,
  },
  {
    id: "balanced",
    label: "均衡组合",
    description: "兼顾概率、热度和风险，是默认方案。",
    size: 3,
    multiplier: 0.9,
  },
  {
    id: "opportunity",
    label: "机会组合",
    description: "覆盖更多场次和高波动机会，模拟比例也更激进。",
    size: 4,
    multiplier: 1.12,
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

function buildDirection(match: MatchCard, mode: PortfolioMode, prefs: UserPrefs) {
  if (match.status === "live" && Math.abs(match.homeScore - match.awayScore) <= 1) {
    return mode === "opportunity" ? "实时进球数观察" : "低波动实时观察";
  }

  if (mode === "stable") {
    return prefs.preferred_markets.includes("双重机会") ? "双重机会方向" : "低波动方向";
  }

  if (mode === "opportunity") {
    return prefs.preferred_markets.includes("大小球") ? "进球数机会" : "冷门机会观察";
  }

  return prefs.preferred_markets.includes("胜平负") ? "胜平负主方向" : "主流市场方向";
}

function buildReason(match: MatchCard, score: number, mode: PortfolioMode) {
  if (match.status === "finished") return "比赛已结束，只保留复盘价值。";
  if (match.status === "live") {
    return Math.abs(match.homeScore - match.awayScore) <= 1
      ? "实时比分仍接近，组合里保留观察价值。"
      : "比赛已拉开差距，只建议降低权重。";
  }
  if (score >= 74) return "联赛热度和球队关注度较高，适合作为组合核心。";
  if (score >= 62) return "信息量足够，可以作为组合里的次选场次。";
  return mode === "opportunity"
    ? "信号不算强，只适合小比例机会观察。"
    : "当前信号偏弱，优先放在观察区。";
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
  const statusPenalty = match.status === "finished" ? -35 : 0;
  const livePenalty =
    match.status === "live" && Math.abs(match.homeScore - match.awayScore) >= 2 ? -8 : 0;
  const modelBoost = prefs.preferred_models.includes("爆冷检测") ? 3 : 0;
  const marketBoost = prefs.preferred_markets.includes("大小球") ? 2 : 0;
  const score = clamp(hotScore + statusPenalty + livePenalty + modelBoost + marketBoost, 0, 100);
  const grade = score >= 74 ? "A" : score >= 62 ? "B" : "C";
  const worthWatching = score >= 58 && match.status !== "finished";
  const cap = riskCapPercent[prefs.risk_level];
  const rawPercent = ((score - 48) / 52) * cap * modeConfig.multiplier;
  const exposurePercent = worthWatching ? clamp(rawPercent, 0.8, cap) : 0;

  return {
    match,
    score: Math.round(score),
    grade,
    direction: buildDirection(match, mode, prefs),
    reason: buildReason(match, score, mode),
    exposurePercent,
    exposurePoints: Math.round((prefs.capital * exposurePercent) / 100),
    worthWatching,
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

  const portfolioPicks = useMemo(
    () =>
      favoriteMatches
        .map((match) => buildPortfolioPick(match, portfolioMode, activePrefs))
        .sort((a, b) => b.score - a.score),
    [activePrefs, favoriteMatches, portfolioMode]
  );
  const modeConfig = portfolioModes.find((item) => item.id === portfolioMode) ?? portfolioModes[1];
  const recommendedIds = useMemo(
    () =>
      portfolioPicks
        .filter((pick) => pick.worthWatching)
        .slice(0, modeConfig.size)
        .map((pick) => pick.match.id),
    [modeConfig.size, portfolioPicks]
  );
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
  const corePicks = portfolioPicks.filter((pick) => pick.grade === "A").length;
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
                <h2 className="text-lg font-semibold">收藏组合参考</h2>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-white/55">
                  系统只在你收藏的比赛里筛选：先排除弱信号，再按风险偏好给出可选组合和模拟投入比例。
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

            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {portfolioModes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    setPortfolioMode(mode.id);
                    resetPortfolio();
                  }}
                  className={`rounded-full border px-3 py-1.5 ${
                    portfolioMode === mode.id
                      ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-black"
                      : "border-white/10 bg-black/35 text-white/60 hover:text-white"
                  }`}
                >
                  {mode.label}
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
                : `${modeConfig.label} 已选 ${selectedPicks.length} 场，总模拟比例 ${formatPercent(
                    totalExposurePercent
                  )}%。优先分散到不同比赛，不把模拟积分集中在单一场次。`}
            </div>
            <div className="mt-3 rounded-xl border border-white/8 bg-black/20 p-3 text-xs leading-6 text-white/50">
              <span className="font-semibold text-white/75">盘口口径：</span>
              当前组合先按收藏池、热度、赛程和风险偏好筛选；详情页有真实赔率时，先用欧赔胜平负做去水校准。后续实时盘口会按亚盘、大小球、欧赔三类一起接入。
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
