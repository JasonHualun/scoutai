"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  calculateFootballPrediction,
  MatchAnalysisData,
  PredictionResult,
  UserPreferences,
} from "@/lib/football-prediction";
import {
  Membership,
  PRO_MONTHLY_PRICE_CNY,
  freeMembership,
} from "@/lib/membership";
import { translateLeague, translateTeam } from "@/lib/league-translations";
import { useAuthStore } from "@/lib/authStore";
import { supabase } from "@/lib/supabase";

type MatchStatus = "live" | "upcoming" | "finished";
type RecentForm = ("W" | "D" | "L")[];

type Match = {
  id: number;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickOff: string;
  minute?: number;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
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
  yellowCardsHome: number;
  yellowCardsAway: number;
  dangerousAttacksHome: number;
  dangerousAttacksAway: number;
  xGHome: number;
  xGAway: number;
};

type OddsData = {
  homeWin: number;
  draw: number;
  awayWin: number;
  handicap: string;
  overUnder: string;
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

type ApiFixture = {
  fixture: {
    id: number;
    date: string;
    status: { short: string; elapsed?: number | null };
  };
  league: { id?: number; name: string; round?: string | null };
  teams: {
    home: { id?: number; name: string };
    away: { id?: number; name: string };
  };
  goals: { home?: number | null; away?: number | null };
};

type ApiStatItem = { type: string; value: number | string | null };
type ApiTeamStats = {
  team: { id: number; name: string };
  statistics: ApiStatItem[];
};

type ApiMatchResponse = {
  fixture?: { response?: ApiFixture[] } | null;
  statistics?: { response?: ApiTeamStats[] } | null;
  odds?: { response?: Array<{ bookmakers?: Array<{ bets?: ApiBet[] }> }> } | null;
  recentForm?: { home?: ApiRecentForm | null; away?: ApiRecentForm | null };
  teamIds?: { home?: number | null; away?: number | null };
};

type ApiMatchCard = Match & { leagueId?: number };

type ApiMatchListResponse = {
  matches?: ApiMatchCard[];
};

type ApiAllFixturesResponse = {
  fixtures?: ApiFixture[];
};

type PreferencesRow = {
  risk_level?: string | null;
  capital?: number | null;
  preferred_markets?: string[] | null;
  preferred_models?: string[] | null;
};

type ApiBet = {
  name: string;
  values?: Array<{ value: string; odd?: string }>;
};

type ApiRecentFixture = {
  teams: { home: { id: number }; away: { id: number } };
  goals: { home?: number | null; away?: number | null };
};

type ApiRecentForm = { response?: ApiRecentFixture[] };

const RECENT_FORM_LIMIT = 10;

const neutralPredictionStats: RealtimeStats = {
  possessionHome: 50,
  possessionAway: 50,
  shotsHome: 0,
  shotsAway: 0,
  shotsOnTargetHome: 0,
  shotsOnTargetAway: 0,
  cornersHome: 0,
  cornersAway: 0,
  yellowCardsHome: 0,
  yellowCardsAway: 0,
  dangerousAttacksHome: 0,
  dangerousAttacksAway: 0,
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

const emptyForm: { home: RecentForm; away: RecentForm } = {
  home: [],
  away: [],
};

const defaultPrefs: UserPreferences = {
  risk_level: "balanced",
  capital: 1000,
  preferred_markets: ["胜平负", "大小球"],
  preferred_models: ["xG-Dixon-Coles", "赔率去水"],
};

const PRO_ORIGINAL_PRICE_CNY = "¥199";

const proBenefits = [
  {
    title: "先筛掉不值得碰的比赛",
    detail: "把概率、赔率和热度放在一起看，少浪费时间在信号很乱的场次上。",
  },
  {
    title: "看懂热门队是不是过热",
    detail: "热门不等于稳，Pro 会提示赔率偏热、平局尾部和爆冷风险。",
  },
  {
    title: "直接读人话版赛前报告",
    detail: "不只给数字，还会说明为什么看好、哪里危险、什么时候该谨慎。",
  },
  {
    title: "后续接入实时盘口更有价值",
    detail: "实时数据 API 充值后，临场盘口和赔率变化会进入 Pro 分析。",
  },
];

function statusFromShort(short: string): MatchStatus {
  if (["1H", "2H", "ET", "BT"].includes(short)) return "live";
  if (["FT", "AET", "PEN"].includes(short)) return "finished";
  return "upcoming";
}

function formatKickoff(dateStr?: string) {
  if (!dateStr) return "--:--";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(dateStr));
}

function fixtureToMatchCard(fixture: ApiFixture): ApiMatchCard {
  const status = statusFromShort(fixture.fixture.status.short);

  return {
    id: fixture.fixture.id,
    league: translateLeague(`${fixture.league.name} · ${fixture.league.round ?? ""}`.trim()),
    homeTeam: translateTeam(fixture.teams.home.name),
    awayTeam: translateTeam(fixture.teams.away.name),
    kickOff: formatKickoff(fixture.fixture.date),
    minute: fixture.fixture.status.elapsed ?? undefined,
    homeScore: fixture.goals.home ?? 0,
    awayScore: fixture.goals.away ?? 0,
    status,
    leagueId: fixture.league.id,
  };
}

function statValue(items: ApiStatItem[] | undefined, type: string) {
  const item = items?.find((stat) => stat.type === type);
  if (!item) return 0;
  const raw =
    typeof item.value === "string" ? Number(item.value.replace("%", "")) : item.value;
  return Number.isFinite(raw) ? Number(raw) : 0;
}

function mapStats(teams?: ApiTeamStats[]): RealtimeStats | null {
  if (!teams || teams.length < 2) return null;
  const home = teams[0].statistics;
  const away = teams[1].statistics;

  const stats = {
    possessionHome: statValue(home, "Ball Possession"),
    possessionAway: statValue(away, "Ball Possession"),
    shotsHome: statValue(home, "Total Shots"),
    shotsAway: statValue(away, "Total Shots"),
    shotsOnTargetHome: statValue(home, "Shots on Target"),
    shotsOnTargetAway: statValue(away, "Shots on Target"),
    cornersHome: statValue(home, "Corner Kicks"),
    cornersAway: statValue(away, "Corner Kicks"),
    yellowCardsHome: statValue(home, "Yellow Cards"),
    yellowCardsAway: statValue(away, "Yellow Cards"),
    dangerousAttacksHome: statValue(home, "Dangerous Attacks"),
    dangerousAttacksAway: statValue(away, "Dangerous Attacks"),
    xGHome: statValue(home, "Expected Goals"),
    xGAway: statValue(away, "Expected Goals"),
  };

  const hasAnyRealStat =
    stats.shotsHome > 0 ||
    stats.shotsAway > 0 ||
    stats.shotsOnTargetHome > 0 ||
    stats.shotsOnTargetAway > 0 ||
    stats.cornersHome > 0 ||
    stats.cornersAway > 0 ||
    stats.yellowCardsHome > 0 ||
    stats.yellowCardsAway > 0 ||
    stats.dangerousAttacksHome > 0 ||
    stats.dangerousAttacksAway > 0 ||
    stats.xGHome > 0 ||
    stats.xGAway > 0;

  return hasAnyRealStat ? stats : null;
}

function mapOdds(bets?: ApiBet[]): OddsData | null {
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

function mapForm(raw: ApiRecentForm | null | undefined, teamId?: number | null): RecentForm {
  if (!raw?.response?.length || !teamId) return [];

  return raw.response.slice(0, RECENT_FORM_LIMIT).map((fixture) => {
    const isHome = fixture.teams.home.id === teamId;
    const gf = isHome ? fixture.goals.home ?? 0 : fixture.goals.away ?? 0;
    const ga = isHome ? fixture.goals.away ?? 0 : fixture.goals.home ?? 0;
    if (gf > ga) return "W";
    if (gf < ga) return "L";
    return "D";
  });
}

function formLabel(result: "W" | "D" | "L") {
  return { W: "胜", D: "平", L: "负" }[result];
}

function buildAnalysisBody(
  match: Match,
  stats: RealtimeStats,
  odds: OddsData,
  form: { home: RecentForm; away: RecentForm }
): MatchAnalysisData {
  return {
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    league: match.league,
    homeForm: form.home.join("-"),
    awayForm: form.away.join("-"),
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
}

function ProbabilityBar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-white/55">
        <span>{label}</span>
        <span>{value.toFixed(1)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/5">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function StatRow({
  label,
  home,
  away,
  isPercent,
}: {
  label: string;
  home: number;
  away: number;
  isPercent?: boolean;
}) {
  const total = home + away || 1;
  const homePct = (home / total) * 100;

  return (
    <div className="rounded-lg border border-white/5 bg-black/25 px-3 py-2 text-xs">
      <div className="flex justify-between text-white/70">
        <span>{isPercent ? `${home}%` : home}</span>
        <span className="text-white/50">{label}</span>
        <span>{isPercent ? `${away}%` : away}</span>
      </div>
      <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-white/5">
        <div className="bg-[color:var(--accent)]" style={{ width: `${homePct}%` }} />
        <div className="flex-1 bg-red-500/70" />
      </div>
    </div>
  );
}

function ProMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/25 p-3">
      <div className="text-[11px] text-white/45">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
      <div className="mt-1 text-[11px] leading-5 text-white/45">{detail}</div>
    </div>
  );
}

function riskLabel(level: UserPreferences["risk_level"]) {
  return {
    conservative: "保守型",
    balanced: "稳健型",
    aggressive: "进取型",
  }[level];
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeRiskLevel(value: unknown): UserPreferences["risk_level"] {
  return value === "conservative" || value === "balanced" || value === "aggressive"
    ? value
    : "balanced";
}

function normalizeStringList(value: unknown, fallback: string[]) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : fallback;
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

function msUntilBeijingMidnight() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const beijingNow = new Date(utcMs + 8 * 60 * 60_000);
  const nextBeijingMidnightUtc =
    Date.UTC(
      beijingNow.getUTCFullYear(),
      beijingNow.getUTCMonth(),
      beijingNow.getUTCDate() + 1
    ) -
    8 * 60 * 60_000;

  return Math.max(0, nextBeijingMidnightUtc - now.getTime());
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function UpgradeModal({
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
  const [promoCountdown, setPromoCountdown] = useState(() =>
    formatCountdown(msUntilBeijingMidnight())
  );

  useEffect(() => {
    if (!open) return;

    const tick = () => setPromoCountdown(formatCountdown(msUntilBeijingMidnight()));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-[color:var(--accent)]/25 bg-[#101513] p-5 shadow-[0_25px_90px_rgba(0,0,0,0.85)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--accent)]/80">
              Pro
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              首月 Pro 体验：把难懂的比赛先筛掉
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/60">
              免费版给基础概率；Pro 会把风险、热度、盘口信号和 AI 解读合成一份更容易看的赛前判断。
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

        <div className="mt-5 overflow-hidden rounded-2xl border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/10">
          <div className="grid gap-4 p-4 md:grid-cols-[1.2fr_0.8fr] md:items-center">
            <div>
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
              <p className="mt-2 text-xs leading-5 text-white/55">
                当前先人工核对到账，不会自动续费；后续续费价格会在付款前明确显示。
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-center">
              <div className="text-[11px] text-white/45">今日优惠倒计时</div>
              <div className="mt-1 font-mono text-2xl font-semibold text-[color:var(--accent)]">
                {promoCountdown}
              </div>
              <div className="mt-1 text-[11px] text-white/45">按北京时间刷新</div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {proBenefits.map((benefit) => (
            <div key={benefit.title} className="rounded-xl border border-white/6 bg-black/25 p-3">
              <div className="text-sm font-semibold text-white">{benefit.title}</div>
              <div className="mt-1 text-xs leading-5 text-white/50">{benefit.detail}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-xl border border-white/8 bg-black/25 p-3">
            <div className="text-[11px] text-white/45">注册邮箱</div>
            <div className="mt-1 break-all text-sm font-semibold text-white">
              {email ?? "请先登录后再提交申请"}
            </div>
            <div className="mt-3 text-[11px] text-white/45">订单编号</div>
            <div className="mt-1 break-all rounded-lg bg-black/35 px-3 py-2 text-xs font-semibold text-[color:var(--accent)]">
              {application?.order_no ?? orderNo}
            </div>
            <div className="mt-3 text-[11px] text-white/45">应付金额</div>
            <div className="mt-1 text-lg font-semibold text-white">{PRO_MONTHLY_PRICE_CNY}</div>
            <div className="mt-3 rounded-lg border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/10 px-3 py-2 text-[11px] leading-5 text-[color:var(--accent)]">
              付款时如能填写备注，请填订单编号，方便后台快速核对。
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
          <div>若 30 分钟后仍未开通，请联系客服并提供订单编号。</div>
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

export default function MatchDetailPage() {
  const params = useParams<{ id: string }>();
  const fixtureId = Number(params.id);
  const user = useAuthStore((state) => state.user);
  const session = useAuthStore((state) => state.session);

  const [match, setMatch] = useState<Match>({
    id: fixtureId,
    league: "未知联赛",
    homeTeam: "主队",
    awayTeam: "客队",
    kickOff: "--:--",
    homeScore: 0,
    awayScore: 0,
    status: "upcoming",
  });
  const [stats, setStats] = useState<RealtimeStats | null>(null);
  const [odds, setOdds] = useState<OddsData | null>(null);
  const [recentForm, setRecentForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [serverPrediction, setServerPrediction] = useState<PredictionResult | null>(null);
  const [userPrefs, setUserPrefs] = useState<UserPreferences | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [customExposurePercent, setCustomExposurePercent] = useState<number | null>(null);
  const [membership, setMembership] = useState<Membership>(() => freeMembership());
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [paymentOrderNo, setPaymentOrderNo] = useState("");
  const [paymentApplication, setPaymentApplication] = useState<PaymentApplication | null>(null);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const isPro = membership.plan === "pro" && membership.status === "active";

  useEffect(() => {
    if (!fixtureId || Number.isNaN(fixtureId)) return;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/match/${fixtureId}`);
        const json = (await res.json()) as ApiMatchResponse;
        const fixture = json.fixture?.response?.[0];
        const teams = json.statistics?.response;
        let nextStatus: MatchStatus = "upcoming";
        let fallbackMatch: ApiMatchCard | null = null;

        if (!fixture) {
          try {
            const allRes = await fetch("/api/football/all");
            const allJson = (await allRes.json()) as ApiAllFixturesResponse;
            const allFixture =
              allJson.fixtures?.find((item) => Number(item.fixture.id) === fixtureId) ??
              null;
            fallbackMatch = allFixture ? fixtureToMatchCard(allFixture) : null;
          } catch {
            fallbackMatch = null;
          }
        }

        if (!fixture && !fallbackMatch) {
          try {
            const listRes = await fetch("/api/football/matches");
            const listJson = (await listRes.json()) as ApiMatchListResponse;
            fallbackMatch =
              listJson.matches?.find((item) => Number(item.id) === fixtureId) ?? null;
          } catch {
            fallbackMatch = null;
          }
        }

        if (fixture) {
          const nextMatch = fixtureToMatchCard(fixture);
          nextStatus = nextMatch.status;
          setMatch(nextMatch);
        } else if (fallbackMatch) {
          nextStatus = fallbackMatch.status;
          setMatch({
            id: fallbackMatch.id,
            league: fallbackMatch.league,
            homeTeam: fallbackMatch.homeTeam,
            awayTeam: fallbackMatch.awayTeam,
            kickOff: fallbackMatch.kickOff,
            minute: fallbackMatch.minute,
            homeScore: fallbackMatch.homeScore,
            awayScore: fallbackMatch.awayScore,
            status: fallbackMatch.status,
          });
        } else if (teams && teams.length >= 2) {
          setMatch((current) => ({
            ...current,
            homeTeam: translateTeam(teams[0].team.name),
            awayTeam: translateTeam(teams[1].team.name),
          }));
        }

        const nextStats = nextStatus === "upcoming" ? null : mapStats(teams);
        setStats(nextStats);

        const bets = json.odds?.response?.[0]?.bookmakers?.[0]?.bets;
        const nextOdds = mapOdds(bets);
        setOdds(nextOdds);

        const homeForm = mapForm(json.recentForm?.home, json.teamIds?.home);
        const awayForm = mapForm(json.recentForm?.away, json.teamIds?.away);
        setRecentForm({
          home: homeForm,
          away: awayForm,
        });
      } catch {
        setStats(null);
        setOdds(null);
        setRecentForm(emptyForm);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [fixtureId]);

  useEffect(() => {
    let cancelled = false;

    async function loadMembership() {
      if (!session) {
        setMembership(freeMembership());
        return;
      }

      setMembershipLoading(true);
      try {
        const res = await fetch("/api/membership", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = (await res.json()) as { membership?: Membership };
        if (!cancelled) setMembership(json.membership ?? freeMembership(user?.email));
      } catch {
        if (!cancelled) setMembership(freeMembership(user?.email));
      } finally {
        if (!cancelled) setMembershipLoading(false);
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

      setPrefsLoading(true);
      try {
        const { data, error } = await supabase
          .from("user_preferences")
          .select("risk_level, capital, preferred_markets, preferred_models")
          .eq("user_id", user.id)
          .maybeSingle<PreferencesRow>();

        if (error) throw error;
        if (cancelled) return;

        const riskLevel = normalizeRiskLevel(data?.risk_level);
        setUserPrefs({
          risk_level: riskLevel,
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
      } finally {
        if (!cancelled) setPrefsLoading(false);
      }
    }

    loadPreferences();
    return () => {
      cancelled = true;
    };
  }, [session, user]);

  useEffect(() => {
    setCustomExposurePercent(null);
  }, [fixtureId, userPrefs?.capital, userPrefs?.risk_level]);

  const analysisBody = useMemo(
    () => buildAnalysisBody(match, stats ?? neutralPredictionStats, odds ?? emptyOdds, recentForm),
    [match, odds, recentForm, stats]
  );

  const activePrefs = isPro && userPrefs ? userPrefs : defaultPrefs;

  const localPrediction = useMemo(
    () => calculateFootballPrediction(analysisBody, activePrefs),
    [activePrefs, analysisBody]
  );

  const prediction = serverPrediction ?? localPrediction;
  const topSignal = prediction.valueSignals[0];
  const backupSignal = prediction.valueSignals[1] ?? topSignal;
  const modelDisagreement = Math.min(
    100,
    Math.max(8, Math.round(100 - prediction.confidence + Math.abs(topSignal.edge ?? 0) * 0.6))
  );
  const upsetRisk = Math.min(
    78,
    Math.max(
      12,
      Math.round(
        prediction.probabilities.awayWin * 0.7 +
          prediction.probabilities.draw * 0.35 +
          (topSignal.edge != null && topSignal.edge < 0 ? 8 : 0)
      )
    )
  );
  const proUntilLabel = membership.proUntil
    ? new Date(membership.proUntil).toLocaleDateString("zh-CN", {
        timeZone: "Asia/Shanghai",
      })
    : null;
  const detailStatusLabel = loading
    ? "数据同步中"
    : match.status === "upcoming"
      ? "等待开赛"
      : stats
        ? "真实数据已更新"
        : "等待数据更新";
  const realtimeEmptyText =
    match.status === "upcoming"
      ? "比赛还未开始，控球、射门、xG 等实时数据会在开赛后更新。"
      : "当前接口暂未返回有效实时统计，已隐藏占位数据。";
  const oddsEmptyText = "当前接口暂未返回真实赔率，价值差暂不计算。";
  const isBaselineEstimate = !stats && !odds;
  const predictionDataNote =
    isBaselineEstimate
      ? "当前没有真实赔率、历史近况和实时统计，以下是模型基准估算，不是真实盘口数据。"
      : !stats
        ? "当前缺少实时统计，概率主要来自赛前信息。"
        : !odds
          ? "当前缺少真实赔率，价值差暂不计算。"
          : "已结合当前可用数据计算。";
  const simulatedPoints = Math.max(0, Math.round(activePrefs.capital || 0));
  const recommendedExposurePercent =
    simulatedPoints > 0
      ? clampValue((prediction.staking.mainAmount / simulatedPoints) * 100, 0, prediction.staking.riskCapPercent)
      : 0;
  const riskCapPercent = Math.max(0.5, prediction.staking.riskCapPercent);
  const selectedExposurePercent = clampValue(
    customExposurePercent ?? recommendedExposurePercent,
    0,
    riskCapPercent
  );
  const selectedExposureAmount = Math.round((simulatedPoints * selectedExposurePercent) / 100);
  const backupExposurePercent = Math.min(selectedExposurePercent * 0.6, riskCapPercent * 0.6);
  const backupExposureAmount = Math.round((simulatedPoints * backupExposurePercent) / 100);
  const selectedPercentLabel = selectedExposurePercent.toFixed(1).replace(".0", "");
  const recommendedPercentLabel = recommendedExposurePercent.toFixed(1).replace(".0", "");
  const backupPercentLabel = backupExposurePercent.toFixed(1).replace(".0", "");
  const modelTags = activePrefs.preferred_models.length
    ? activePrefs.preferred_models
    : defaultPrefs.preferred_models;
  const marketTags = activePrefs.preferred_markets.length
    ? activePrefs.preferred_markets
    : defaultPrefs.preferred_markets;
  const purchaseRecommendation =
    topSignal.edge == null
      ? "缺少真实赔率，先作为赛前观察；等盘口更新后再确认。"
      : topSignal.edge <= 0
        ? "模型没有明显高于市场，建议观望或等待临场变化。"
        : selectedExposurePercent > riskCapPercent * 0.8
          ? "所选比例接近单场上限，只适合进取观察；临场数据变化要及时下调。"
          : topSignal.edge >= 5 && prediction.confidence >= 55
            ? "模型优势较清晰，可按当前比例作为本场模拟参考。"
            : "优势存在但不算强，建议低比例观察。";

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

  async function handleAnalyze() {
    setAiLoading(true);
    setAiError(null);
    setAiAnalysis(null);

    if (!user || !session) {
      openUpgrade();
      setAiLoading(false);
      return;
    }

    if (!isPro) {
      openUpgrade();
      setAiLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(analysisBody),
      });

      const json = (await res.json()) as {
        analysis?: string;
        prediction?: PredictionResult;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "分析失败");

      setAiAnalysis(json.analysis ?? null);
      if (json.prediction) setServerPrediction(json.prediction);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 分析失败，请稍后重试";
      setAiError(message);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-2 text-xs text-white/60 hover:text-white">
        ← 返回热门赛事
      </Link>

      <section className="rounded-2xl border border-white/5 bg-[color:var(--card)]/90 p-4 shadow-[0_18px_75px_rgba(0,0,0,0.75)]">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--accent)]/80">
              {translateLeague(match.league)}
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              {match.homeTeam} <span className="text-base text-white/40">vs</span>{" "}
              {match.awayTeam}
            </h1>
            <p className="mt-2 text-xs text-white/55">
              开球时间：{match.kickOff}
              {match.status === "live" && ` · 进行中 ${match.minute ?? 0}'`}
            </p>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-4xl font-semibold">
              {match.homeScore}
              <span className="mx-2 text-xl text-white/35">:</span>
              {match.awayScore}
            </div>
            <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/65">
              {detailStatusLabel}
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-[1.35fr,1fr]">
        <div className="rounded-2xl border border-white/5 bg-[color:var(--card)]/90 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="mb-2 inline-flex rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] font-semibold text-white/55">
                {isBaselineEstimate ? "免费版 · 模型基准估算" : "免费版 · 基础预测"}
              </div>
              <h2 className="text-sm font-semibold">
                {isBaselineEstimate ? "模型基准估算" : "基础概率预测"}
              </h2>
              <p className="mt-1 text-[11px] text-white/50">
                {prediction.modelVersion} · 置信度 {prediction.confidence}%
              </p>
              <p className="mt-1 text-[11px] text-white/40">{predictionDataNote}</p>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-white/45">
                {isBaselineEstimate ? "模型推演比分" : "最可能比分"}
              </div>
              <div className="text-2xl font-semibold text-[color:var(--accent)]">
                {prediction.predictedScore.label}
              </div>
            </div>
          </div>

          {isBaselineEstimate && (
            <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/8 px-3 py-2 text-xs leading-5 text-amber-100/75">
              说明：这部分只是用中性进球分布和基础风控参数做的框架推演，方便先看产品流程；真实 API
              接入赔率、历史战绩、伤停和球员数据后，概率会重新计算。
            </div>
          )}

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <ProbabilityBar label="主胜" value={prediction.probabilities.homeWin} tone="bg-[color:var(--accent)]" />
            <ProbabilityBar label="平局" value={prediction.probabilities.draw} tone="bg-slate-400" />
            <ProbabilityBar label="客胜" value={prediction.probabilities.awayWin} tone="bg-red-500" />
          </div>

          <div className="mt-5 grid gap-3 text-xs md:grid-cols-3">
            <div className="rounded-xl bg-black/25 p-3">
              <div className="text-white/45">预期进球</div>
              <div className="mt-1 text-base font-semibold">
                {prediction.expectedGoals.home.toFixed(2)} - {prediction.expectedGoals.away.toFixed(2)}
              </div>
            </div>
            <div className="rounded-xl bg-black/25 p-3">
              <div className="text-white/45">大 2.5</div>
              <div className="mt-1 text-base font-semibold">{prediction.probabilities.over25}%</div>
            </div>
            <div className="rounded-xl bg-black/25 p-3">
              <div className="text-white/45">双方进球</div>
              <div className="mt-1 text-base font-semibold">
                {prediction.probabilities.bothTeamsToScore}%
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/5 bg-[color:var(--card)]/90 p-4">
          <div className="mb-2 inline-flex rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] font-semibold text-white/55">
            免费版
          </div>
          <h2 className="text-sm font-semibold">
            {odds ? "基础价值信号" : "模型公平赔率"}
          </h2>
          {!odds && (
            <p className="mt-1 text-[11px] leading-5 text-white/42">
              这里不是庄家赔率，是由模型概率反推的公平赔率；真实盘口接入后才会计算价值差。
            </p>
          )}
          <div className="mt-3 space-y-2">
            {prediction.valueSignals.map((signal) => (
              <div
                key={signal.market}
                className="flex items-center justify-between rounded-lg border border-white/5 bg-black/25 px-3 py-2 text-xs"
              >
                <div>
                  <div className="font-medium text-white">{signal.label}</div>
                  <div className="mt-0.5 text-[11px] text-white/45">
                    模型公平赔率 {signal.fairOdds.toFixed(2)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-white/75">{signal.modelProbability}%</div>
                  <div
                    className={`text-[11px] ${
                      signal.edge != null && signal.edge > 0
                        ? "text-[color:var(--accent)]"
                        : "text-white/40"
                    }`}
                  >
                    {signal.edge == null ? "未接真实盘口" : `差值 ${signal.edge}%`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-[1fr,1fr]">
        <div className="rounded-2xl border border-white/5 bg-[color:var(--card)]/90 p-4">
          <h2 className="text-sm font-semibold">实时数据对比</h2>
          {stats ? (
            <div className="mt-3 space-y-2">
              <StatRow label="控球率" home={stats.possessionHome} away={stats.possessionAway} isPercent />
              <StatRow label="射门" home={stats.shotsHome} away={stats.shotsAway} />
              <StatRow label="射正" home={stats.shotsOnTargetHome} away={stats.shotsOnTargetAway} />
              <StatRow label="角球" home={stats.cornersHome} away={stats.cornersAway} />
              <StatRow label="黄牌" home={stats.yellowCardsHome} away={stats.yellowCardsAway} />
              <StatRow label="危险进攻" home={stats.dangerousAttacksHome} away={stats.dangerousAttacksAway} />
              <StatRow label="xG" home={stats.xGHome} away={stats.xGAway} />
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-black/25 p-4 text-xs leading-6 text-white/55">
              {realtimeEmptyText}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/5 bg-[color:var(--card)]/90 p-4">
          <h2 className="text-sm font-semibold">赔率与近况</h2>
          {odds ? (
            <>
              <div className="mt-3 grid gap-3 text-xs md:grid-cols-3">
                {[
                  ["主胜", odds.homeWin],
                  ["平局", odds.draw],
                  ["客胜", odds.awayWin],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-black/25 p-3">
                    <div className="text-white/45">{label}</div>
                    <div className="mt-1 text-base font-semibold">{Number(value).toFixed(2)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
                <div className="rounded-xl bg-black/25 p-3">
                  <div className="text-white/45">让球</div>
                  <div className="mt-1 text-white/80">{odds.handicap}</div>
                </div>
                <div className="rounded-xl bg-black/25 p-3">
                  <div className="text-white/45">大小球</div>
                  <div className="mt-1 text-white/80">{odds.overUnder}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-black/25 p-4 text-xs leading-6 text-white/55">
              {oddsEmptyText}
            </div>
          )}

          <div className="mt-4 grid gap-3 text-xs md:grid-cols-2">
            {[
              [match.homeTeam, recentForm.home],
              [match.awayTeam, recentForm.away],
            ].map(([team, form]) => (
              <div key={String(team)} className="rounded-xl bg-black/25 p-3">
                <div className="mb-2 text-white/60">{String(team)} 近 {RECENT_FORM_LIMIT} 场</div>
                {(form as RecentForm).length > 0 ? (
                  <div className="flex gap-2">
                    {(form as RecentForm).map((result, index) => (
                      <span
                        key={`${result}-${index}`}
                        className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] ${
                          result === "W"
                            ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                            : result === "D"
                              ? "border-slate-400/40 bg-slate-500/15 text-slate-200"
                              : "border-red-400/40 bg-red-500/15 text-red-300"
                        }`}
                      >
                        {formLabel(result)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-white/40">暂无近况数据</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[color:var(--accent)]/20 bg-[color:var(--card)]/90 p-4 shadow-[0_18px_75px_rgba(0,0,0,0.72)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 inline-flex rounded-full border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 px-2 py-0.5 text-[10px] font-semibold text-[color:var(--accent)]">
              Pro 高级版 · {PRO_MONTHLY_PRICE_CNY}/月
            </div>
            <h2 className="text-sm font-semibold">模型委员会深度预测</h2>
            <p className="mt-1 text-[11px] text-white/50">
              盘口、赔率、xG、比分分布和 Claude 深度解释会在这里汇总。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] text-white/60">
              {membershipLoading
                ? "会员状态同步中"
                : isPro
                  ? `Pro 有效${proUntilLabel ? `至 ${proUntilLabel}` : ""}`
                  : "当前为免费版"}
            </span>
            <button
              onClick={handleAnalyze}
              disabled={aiLoading || membershipLoading}
              className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-xs font-semibold text-black shadow-[0_0_28px_rgba(0,255,135,0.65)] hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {aiLoading ? "分析中..." : isPro ? "生成 Pro 分析" : "解锁 Pro"}
            </button>
          </div>
        </div>

        <div className={`mt-4 grid gap-3 md:grid-cols-3 ${isPro ? "" : "opacity-65"}`}>
          <ProMetric
            label="模型分歧指数"
            value={`${modelDisagreement}%`}
            detail="衡量基础概率、赔率信号和比分分布是否互相打架。"
          />
          <ProMetric
            label="爆冷风险"
            value={`${upsetRisk}%`}
            detail="结合平局/客胜尾部概率和市场差值估算。"
          />
          <ProMetric
            label="盘口监控"
            value={isPro ? "已启用" : "待解锁"}
            detail="充值实时数据 API 后会展示临场盘口变化。"
          />
        </div>

        <div
          className={`mt-4 rounded-2xl border border-[color:var(--accent)]/25 bg-[linear-gradient(180deg,rgba(0,255,135,0.08),rgba(0,0,0,0.24))] p-4 ${
            isPro ? "" : "opacity-70"
          }`}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="mb-2 inline-flex rounded-full border border-[color:var(--accent)]/35 bg-[color:var(--accent)]/10 px-3 py-1 text-[11px] font-semibold text-[color:var(--accent)]">
                会员模拟方案
              </div>
              <h3 className="text-base font-semibold">本场购买参考</h3>
              <p className="mt-1 text-xs leading-5 text-white/52">
                按你的模拟积分、风险偏好和模型选择，给出本场主方案、备选方案和比例上限。
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[11px] text-white/65">
              {prefsLoading
                ? "正在同步会员偏好"
                : isPro
                  ? `${riskLabel(activePrefs.risk_level)} · ${simulatedPoints} 模拟积分`
                  : "Pro 解锁后按你的设置计算"}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-black/25 p-3">
              <div className="text-[11px] text-white/45">模型建议比例</div>
              <div className="mt-1 text-2xl font-semibold text-[color:var(--accent)]">
                {recommendedPercentLabel}%
              </div>
              <div className="mt-1 text-[11px] text-white/45">
                约 {prediction.staking.mainAmount} 模拟积分
              </div>
            </div>
            <div className="rounded-xl bg-black/25 p-3">
              <div className="text-[11px] text-white/45">你选择的本场比例</div>
              <div className="mt-1 text-2xl font-semibold text-white">
                {selectedPercentLabel}%
              </div>
              <div className="mt-1 text-[11px] text-white/45">
                约 {selectedExposureAmount} 模拟积分
              </div>
            </div>
            <div className="rounded-xl bg-black/25 p-3">
              <div className="text-[11px] text-white/45">单场风控上限</div>
              <div className="mt-1 text-2xl font-semibold text-white">
                {riskCapPercent.toFixed(1).replace(".0", "")}%
              </div>
              <div className="mt-1 text-[11px] text-white/45">
                由 {riskLabel(activePrefs.risk_level)} 自动限制
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/8 bg-black/25 p-3">
            <div className="flex items-center justify-between gap-3 text-[11px] text-white/45">
              <span>0%</span>
              <span>调整本场模拟比例</span>
              <span>{riskCapPercent.toFixed(1).replace(".0", "")}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={riskCapPercent}
              step={0.5}
              value={selectedExposurePercent}
              disabled={!isPro || prefsLoading}
              onChange={(event) => setCustomExposurePercent(Number(event.target.value))}
              className="mt-3 h-2 w-full accent-[color:var(--accent)] disabled:opacity-50"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!isPro || prefsLoading}
                onClick={() => setCustomExposurePercent(null)}
                className="rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-[11px] font-semibold text-white/65 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                使用模型建议比例
              </button>
              {!isPro && (
                <button
                  type="button"
                  onClick={openUpgrade}
                  className="rounded-full bg-[color:var(--accent)] px-3 py-1.5 text-[11px] font-semibold text-black hover:bg-emerald-300"
                >
                  解锁会员模拟方案
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/8 bg-black/25 p-3">
              <div className="text-[11px] text-white/45">主方案</div>
              <div className="mt-1 text-base font-semibold text-white">
                {topSignal.label} · {selectedExposureAmount} 模拟积分
              </div>
              <div className="mt-1 text-[11px] leading-5 text-white/45">
                模型概率 {topSignal.modelProbability}% · 模型公平赔率 {topSignal.fairOdds.toFixed(2)}
                {topSignal.edge == null ? " · 暂无市场差" : ` · 价值差 ${topSignal.edge}%`}
              </div>
            </div>
            <div className="rounded-xl border border-white/8 bg-black/25 p-3">
              <div className="text-[11px] text-white/45">备选方案</div>
              <div className="mt-1 text-base font-semibold text-white">
                {backupSignal.label} · {backupExposureAmount} 模拟积分
              </div>
              <div className="mt-1 text-[11px] leading-5 text-white/45">
                备选比例 {backupPercentLabel}% · 用于主方向不够清晰时参考
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/10 p-3 text-xs leading-6 text-[color:var(--accent)]">
            <span className="font-semibold">本场参考：</span>
            {purchaseRecommendation}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-2 text-[11px] text-white/45">本场启用模型</div>
              <div className="flex flex-wrap gap-2">
                {modelTags.map((model) => (
                  <span key={model} className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] text-white/65">
                    {model}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-[11px] text-white/45">关注市场</div>
              <div className="flex flex-wrap gap-2">
                {marketTags.map((market) => (
                  <span key={market} className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] text-white/65">
                    {market}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {!isPro && (
          <div className="mt-4 rounded-xl border border-dashed border-[color:var(--accent)]/25 bg-black/25 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-white">升级后解锁完整深度报告</div>
                <p className="mt-1 text-xs leading-5 text-white/55">
                  包含 Claude 分析、盘口异动、爆冷风险、模型分歧、临场变化和风控上限。
                </p>
              </div>
              <button
                type="button"
                onClick={openUpgrade}
                className="rounded-full border border-[color:var(--accent)]/45 bg-[color:var(--accent)]/10 px-4 py-2 text-xs font-semibold text-[color:var(--accent)] hover:bg-[color:var(--accent)] hover:text-black"
              >
                开通 Pro
              </button>
            </div>
          </div>
        )}

        {aiError && (
          <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {aiError}
          </div>
        )}

        {aiAnalysis ? (
          <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-black/25 p-4 font-sans text-xs leading-6 text-white/85">
            {aiAnalysis}
          </pre>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-xs leading-6 text-white/55">
            {isPro
              ? "点击生成后，会结合你的偏好、模拟积分和模型配置输出 Pro 深度分析。"
              : "免费版保留基础概率预测；Pro 会展示更完整的模型委员会报告。"}
          </div>
        )}
      </section>

      <UpgradeModal
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
