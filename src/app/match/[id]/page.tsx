"use client";

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
import { displayPreferenceLabel } from "@/lib/preference-options";
import type { PredictionOrder, PredictionOrderItem } from "@/lib/prediction-orders";
import { useAuthStore } from "@/lib/authStore";
import { supabase } from "@/lib/supabase";
import { ProPurchaseDialog } from "@/components/ProPurchaseDialog";

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
  possessionHome: number | null;
  possessionAway: number | null;
  shotsHome: number | null;
  shotsAway: number | null;
  shotsOnTargetHome: number | null;
  shotsOnTargetAway: number | null;
  shotsOffTargetHome: number | null;
  shotsOffTargetAway: number | null;
  cornersHome: number | null;
  cornersAway: number | null;
  yellowCardsHome: number | null;
  yellowCardsAway: number | null;
  redCardsHome: number | null;
  redCardsAway: number | null;
  dangerousAttacksHome: number | null;
  dangerousAttacksAway: number | null;
  touchesInBoxHome: number | null;
  touchesInBoxAway: number | null;
  bigChancesHome: number | null;
  bigChancesAway: number | null;
  foulsHome: number | null;
  foulsAway: number | null;
  passesHome: number | null;
  passesAway: number | null;
  savesHome: number | null;
  savesAway: number | null;
  xGHome: number | null;
  xGAway: number | null;
};

type OddsData = {
  homeWin: number;
  draw: number;
  awayWin: number;
  handicap: string;
  overUnder: string;
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
  marketSignals?: MarketSignals | null;
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

type PredictionHistorySummary = {
  total: number;
  settled: number;
  wins: number;
  hitRate: number;
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

type MarketSignals = {
  source: string;
  availableBooks: string[];
  overroundPercent: number | null;
  noVig: {
    homeWin: number;
    draw: number;
    awayWin: number;
  } | null;
  openingNoVig: {
    homeWin: number;
    draw: number;
    awayWin: number;
  } | null;
  pressure: string;
  exchangeLean: string | null;
  bookmakerSpreadPercent: number | null;
  note: string;
};

type DetailTone = "neutral" | "green" | "amber" | "red";

type DetailCard = {
  label: string;
  value: string;
  detail: string;
  tone?: DetailTone;
};

const RECENT_FORM_LIMIT = 10;

const neutralPredictionStats: RealtimeStats = {
  possessionHome: 50,
  possessionAway: 50,
  shotsHome: 0,
  shotsAway: 0,
  shotsOnTargetHome: 0,
  shotsOnTargetAway: 0,
  shotsOffTargetHome: 0,
  shotsOffTargetAway: 0,
  cornersHome: 0,
  cornersAway: 0,
  yellowCardsHome: 0,
  yellowCardsAway: 0,
  redCardsHome: 0,
  redCardsAway: 0,
  dangerousAttacksHome: 0,
  dangerousAttacksAway: 0,
  touchesInBoxHome: 0,
  touchesInBoxAway: 0,
  bigChancesHome: 0,
  bigChancesAway: 0,
  foulsHome: 0,
  foulsAway: 0,
  passesHome: 0,
  passesAway: 0,
  savesHome: 0,
  savesAway: 0,
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

function statusFromShort(short: string): MatchStatus {
  if (["1H", "2H", "ET", "BT"].includes(short)) return "live";
  if (["FT", "AET", "PEN", "PST", "CANC", "ABD", "AWD", "WO"].includes(short))
    return "finished";
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
  if (!item || item.value === null || item.value === undefined || item.value === "") return null;
  const raw =
    typeof item.value === "string" ? Number(item.value.replace("%", "")) : item.value;
  return Number.isFinite(raw) ? Number(raw) : null;
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
    shotsOffTargetHome: statValue(home, "Shots off Target"),
    shotsOffTargetAway: statValue(away, "Shots off Target"),
    cornersHome: statValue(home, "Corner Kicks"),
    cornersAway: statValue(away, "Corner Kicks"),
    yellowCardsHome: statValue(home, "Yellow Cards"),
    yellowCardsAway: statValue(away, "Yellow Cards"),
    redCardsHome: statValue(home, "Red Cards"),
    redCardsAway: statValue(away, "Red Cards"),
    dangerousAttacksHome: statValue(home, "Dangerous Attacks"),
    dangerousAttacksAway: statValue(away, "Dangerous Attacks"),
    touchesInBoxHome: statValue(home, "Touches in Box"),
    touchesInBoxAway: statValue(away, "Touches in Box"),
    bigChancesHome: statValue(home, "Big Chances"),
    bigChancesAway: statValue(away, "Big Chances"),
    foulsHome: statValue(home, "Fouls"),
    foulsAway: statValue(away, "Fouls"),
    passesHome: statValue(home, "Passes"),
    passesAway: statValue(away, "Passes"),
    savesHome: statValue(home, "Goalkeeper Saves"),
    savesAway: statValue(away, "Goalkeeper Saves"),
    xGHome: statValue(home, "Expected Goals"),
    xGAway: statValue(away, "Expected Goals"),
  };

  const hasAnyRealStat = Object.values(stats).some((value) => value !== null);

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

function statNumber(value: number | null | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function percentStat(value: number | null | undefined, fallback = 50) {
  return statNumber(value, fallback);
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
      possession: percentStat(stats.possessionHome),
      shots: statNumber(stats.shotsHome),
      shotsOnTarget: statNumber(stats.shotsOnTargetHome),
      xG: statNumber(stats.xGHome),
      corners: statNumber(stats.cornersHome),
    },
    awayStats: {
      possession: percentStat(stats.possessionAway),
      shots: statNumber(stats.shotsAway),
      shotsOnTarget: statNumber(stats.shotsOnTargetAway),
      xG: statNumber(stats.xGAway),
      corners: statNumber(stats.cornersAway),
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
  home: number | null;
  away: number | null;
  isPercent?: boolean;
}) {
  const hasHome = typeof home === "number" && Number.isFinite(home);
  const hasAway = typeof away === "number" && Number.isFinite(away);
  const homeValue = hasHome ? home : 0;
  const awayValue = hasAway ? away : 0;
  const total = homeValue + awayValue || 1;
  const homePct = hasHome || hasAway ? (homeValue / total) * 100 : 50;
  const format = (value: number | null) =>
    typeof value === "number" && Number.isFinite(value)
      ? isPercent
        ? `${value}%`
        : value
      : "待返回";

  return (
    <div className="rounded-lg border border-white/5 bg-black/25 px-3 py-2 text-xs">
      <div className="flex justify-between text-white/70">
        <span>{format(home)}</span>
        <span className="text-white/50">{label}</span>
        <span>{format(away)}</span>
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

function DetailMetric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  const toneClass =
    tone === "green"
      ? "text-[color:var(--accent)]"
      : tone === "amber"
        ? "text-amber-200"
        : tone === "red"
          ? "text-red-200"
          : "text-white";

  return (
    <div className="rounded-xl border border-white/6 bg-black/25 p-3">
      <div className="text-[11px] text-white/45">{label}</div>
      <div className={`mt-1 text-base font-semibold ${toneClass}`}>{value}</div>
      {detail && <div className="mt-1 text-[11px] leading-5 text-white/42">{detail}</div>}
    </div>
  );
}

function formatMaybeNumber(value: number | null | undefined, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "待返回";
  return `${value}${suffix}`;
}

function formatStatNumber(value: number | null | undefined, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "待返回";
  return `${value}${suffix}`;
}

function formatStatPair(
  home: number | null | undefined,
  away: number | null | undefined,
  suffix = ""
) {
  const hasHome = typeof home === "number" && Number.isFinite(home);
  const hasAway = typeof away === "number" && Number.isFinite(away);
  if (!hasHome && !hasAway) return "接口暂未返回";
  return `${hasHome ? `${home}${suffix}` : "待返回"} : ${
    hasAway ? `${away}${suffix}` : "待返回"
  }`;
}

function formatStatSlash(
  firstHome: number | null | undefined,
  firstAway: number | null | undefined,
  secondHome: number | null | undefined,
  secondAway: number | null | undefined
) {
  const hasFirst =
    typeof firstHome === "number" ||
    typeof firstAway === "number" ||
    typeof secondHome === "number" ||
    typeof secondAway === "number";
  if (!hasFirst) return "接口暂未返回";
  return `${formatStatNumber(firstHome)}-${formatStatNumber(firstAway)} / ${formatStatNumber(
    secondHome
  )}-${formatStatNumber(secondAway)}`;
}

function formatDecimal(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "待返回";
  return value.toFixed(digits);
}

function formatDelta(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function matchOutcome(home: number, away: number) {
  if (home > away) return "homeWin";
  if (home < away) return "awayWin";
  return "draw";
}

function signalOutcome(signal: PredictionResult["valueSignals"][number]) {
  return signal.market === "homeWin" || signal.market === "draw" || signal.market === "awayWin"
    ? signal.market
    : null;
}

function outcomeLabel(value: "homeWin" | "draw" | "awayWin") {
  return { homeWin: "主胜", draw: "平局", awayWin: "客胜" }[value];
}

function resultStatusLabel(status?: PredictionOrderItem["resultStatus"]) {
  return {
    won: "命中",
    lost: "未命中",
    push: "走水",
    void: "取消",
    pending: "等待赛果",
  }[status ?? "pending"];
}

function shotQuality(xg: number | null | undefined, shots: number | null | undefined) {
  const xgValue = statNumber(xg);
  const shotValue = statNumber(shots);
  if (shotValue <= 0 || xgValue <= 0) return "待返回";
  return `${(xgValue / shotValue).toFixed(2)} xG/射门`;
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

export default function MatchDetailPage() {
  const params = useParams<{ id: string }>();
  const fixtureParam = params.id;
  const fixtureId = Number(fixtureParam.replace(/\D/g, ""));
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
  const [marketSignals, setMarketSignals] = useState<MarketSignals | null>(null);
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
  const [predictionRecord, setPredictionRecord] = useState<PredictionOrderItem | null>(null);
  const [predictionRecordLoading, setPredictionRecordLoading] = useState(false);
  const [predictionHistorySummary, setPredictionHistorySummary] =
    useState<PredictionHistorySummary | null>(null);

  const isPro = membership.plan === "pro" && membership.status === "active";

  useEffect(() => {
    if (!fixtureId || Number.isNaN(fixtureId)) return;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/match/${encodeURIComponent(fixtureParam)}`, {
          cache: "no-store",
        });
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
        setMarketSignals(json.marketSignals ?? null);

        const homeForm = mapForm(json.recentForm?.home, json.teamIds?.home);
        const awayForm = mapForm(json.recentForm?.away, json.teamIds?.away);
        setRecentForm({
          home: homeForm,
          away: awayForm,
        });
      } catch {
        setStats(null);
        setOdds(null);
        setMarketSignals(null);
        setRecentForm(emptyForm);
      } finally {
        setLoading(false);
      }
    }

    load();
    const refreshId = window.setInterval(load, 60000);
    return () => window.clearInterval(refreshId);
  }, [fixtureId, fixtureParam]);

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

    async function loadPredictionRecord() {
      if (!session) {
        setPredictionRecord(null);
        setPredictionHistorySummary(null);
        return;
      }

      setPredictionRecordLoading(true);
      try {
        const res = await fetch("/api/prediction-orders", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const json = (await res.json()) as { orders?: PredictionOrder[] };
        const allItems = json.orders?.flatMap((order) => order.items) ?? [];
        const settledItems = allItems.filter((item) => item.resultStatus !== "pending");
        const wins = settledItems.filter((item) => item.resultStatus === "won").length;
        const fixtureDigits = String(fixtureId);
        const currentParam = String(fixtureParam);
        const item =
          allItems
            .find((orderItem) => {
              const itemId = String(orderItem.fixtureId);
              return itemId === currentParam || itemId.replace(/\D/g, "") === fixtureDigits;
            }) ?? null;
        if (!cancelled) {
          setPredictionRecord(item);
          setPredictionHistorySummary({
            total: allItems.length,
            settled: settledItems.length,
            wins,
            hitRate: settledItems.length > 0 ? Math.round((wins / settledItems.length) * 100) : 0,
          });
        }
      } catch {
        if (!cancelled) {
          setPredictionRecord(null);
          setPredictionHistorySummary(null);
        }
      } finally {
        if (!cancelled) setPredictionRecordLoading(false);
      }
    }

    loadPredictionRecord();
    return () => {
      cancelled = true;
    };
  }, [fixtureId, fixtureParam, session]);

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
  const hasMarketData = Boolean(odds || marketSignals);
  const detailStatusLabel = loading
    ? "数据同步中"
    : match.status === "upcoming"
      ? "等待开赛"
      : stats
        ? "真实统计已更新"
        : hasMarketData
          ? "比分/盘口已同步 · 统计待返回"
          : "进行中 · 等待实时统计";
  const realtimeEmptyText =
    match.status === "upcoming"
      ? "比赛还未开始，控球、射门、xG 等实时数据会在开赛后更新。"
      : hasMarketData
        ? "本场已经同步比分、状态和盘口；射门、角球、黄牌、xG 等实时统计源暂未返回。系统不会用假数据占位，等数据源返回后会自动展示。"
        : "比分和状态已同步；射门、角球、黄牌、xG 等实时统计暂未返回。系统不会展示占位假数据。";
  const dataSourceCards = [
    {
      label: "比分状态",
      value: match.status === "upcoming" ? "待开赛" : "已同步",
      active: match.status !== "upcoming",
      detail:
        match.status === "live"
          ? "正在比赛，比分会跟随接口刷新"
          : match.status === "finished"
            ? "比赛已结束"
            : "开赛后自动刷新",
    },
    {
      label: "盘口指数",
      value: hasMarketData ? "已同步" : "待返回",
      active: hasMarketData,
      detail: hasMarketData ? "可用于市场概率和价值差计算" : "盘口源暂未覆盖本场",
    },
    {
      label: "实时统计",
      value: stats ? "已同步" : match.status === "upcoming" ? "开赛后更新" : "源未返回",
      active: Boolean(stats),
      detail: stats ? "射门、角球、牌和 xG 已可用" : "没有返回就不展示假统计",
    },
  ];
  const oddsEmptyText = "市场指数暂未更新，价值差暂不计算。";
  const marketSignalCards = marketSignals
    ? [
        {
          label: "庄家抽水",
          value:
            marketSignals.overroundPercent == null
              ? "待更新"
              : `${marketSignals.overroundPercent}%`,
          detail: `${marketSignals.source} 去水前盘口`,
        },
        {
          label: "盘口倾向",
          value: marketSignals.pressure,
          detail: "开盘到最新价格变化",
        },
        {
          label: "交易所参考",
          value: marketSignals.exchangeLean ?? "待更新",
          detail: "Betfair 与锐利盘口差异",
        },
        {
          label: "盘口分歧",
          value:
            marketSignals.bookmakerSpreadPercent == null
              ? "待更新"
              : `${marketSignals.bookmakerSpreadPercent}%`,
          detail: `${marketSignals.availableBooks.length} 个盘口源`,
        },
      ]
    : [];
  const isFinished = match.status === "finished";
  const finalOutcome = matchOutcome(match.homeScore, match.awayScore);
  const topSignalOutcome = signalOutcome(topSignal);
  const topSignalHit =
    isFinished && topSignalOutcome
      ? topSignalOutcome === finalOutcome
      : null;
  const marketMovementRows =
    marketSignals?.openingNoVig && marketSignals.noVig
      ? [
          {
            label: "主胜",
            opening: marketSignals.openingNoVig.homeWin,
            current: marketSignals.noVig.homeWin,
          },
          {
            label: "平局",
            opening: marketSignals.openingNoVig.draw,
            current: marketSignals.noVig.draw,
          },
          {
            label: "客胜",
            opening: marketSignals.openingNoVig.awayWin,
            current: marketSignals.noVig.awayWin,
          },
        ].map((item) => ({
          ...item,
          delta: Math.round((item.current - item.opening) * 10) / 10,
        }))
      : [];
  const strongestMarketMove =
    marketMovementRows.length > 0
      ? [...marketMovementRows].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0]
      : null;
  const modelLeader = [
    { label: "主胜", value: prediction.probabilities.homeWin },
    { label: "平局", value: prediction.probabilities.draw },
    { label: "客胜", value: prediction.probabilities.awayWin },
  ].sort((a, b) => b.value - a.value)[0];
  const recommendationChangedText =
    marketSignals || stats
      ? `${topSignal.label} · 当前快照已按最新可用数据重算`
      : `${topSignal.label} · 等待盘口或统计返回后复核`;
  const upsetSnapshotText =
    strongestMarketMove && ["平局", "客胜"].includes(strongestMarketMove.label)
      ? `冷门方向${strongestMarketMove.delta >= 0 ? "升温" : "降温"} ${formatDelta(strongestMarketMove.delta)}`
      : `当前冷门风险 ${upsetRisk}%`;
  const shotQualityHome = shotQuality(stats?.xGHome, stats?.shotsHome);
  const shotQualityAway = shotQuality(stats?.xGAway, stats?.shotsAway);
  const postMatchDeviationReasons = [
    stats
      ? `全场射门 ${formatMaybeNumber(stats.shotsHome)}-${formatMaybeNumber(stats.shotsAway)}，射正 ${formatMaybeNumber(stats.shotsOnTargetHome)}-${formatMaybeNumber(stats.shotsOnTargetAway)}。`
      : "技术统计源未返回，赛后偏差只能先按比分和盘口判断。",
    stats
      ? `xG ${formatDecimal(stats.xGHome)}-${formatDecimal(stats.xGAway)}，射门质量 ${shotQualityHome} / ${shotQualityAway}。`
      : "xG 或射门质量待数据源补齐。",
    marketSignals?.pressure
      ? `盘口变化：${marketSignals.pressure}。`
      : "盘口赛前到赛后的变化暂未返回。",
  ];
  const isBaselineEstimate = !stats && !odds;
  const deskLabel =
    match.status === "finished"
      ? "POST MATCH DATA"
      : match.status === "live"
        ? "LIVE MATCH DATA"
        : "PRE MATCH DATA";
  const deskTitle =
    match.status === "finished"
      ? "赛后数据复盘"
      : match.status === "live"
        ? "赛中实时数据"
        : "赛前数据准备";
  const deskDescription =
    match.status === "finished"
      ? "比赛结束后重点看最终比分、全场技术统计、xG、盘口变化、赛前预测是否命中和偏差原因。"
      : match.status === "live"
        ? "比赛进行中优先看实时比分、比赛时间、控球率、射门、射正、角球、红黄牌、xG、危险进攻和盘口变化。"
        : "开赛前重点看开球时间、赛前盘口/赔率、模型赛前方向和预计比分；控球、射门、xG 等技术统计要开赛后才会返回。";
  const matchClockText =
    match.status === "live"
      ? typeof match.minute === "number"
        ? `比赛时间 ${match.minute}'`
        : "进行中"
      : match.status === "finished"
        ? "比赛已结束"
        : "等待开赛";
  const technicalDataStatus = stats
    ? "已返回"
    : match.status === "upcoming"
      ? "开赛后更新"
      : "接口暂未返回";
  const technicalDataDetail = stats
    ? "控球、射门、角球、牌、xG 等字段已可查看"
    : match.status === "upcoming"
      ? "这些是赛中数据，开赛后才会有"
      : "当前数据源只返回比分/状态，暂未返回技术统计";
  const marketDataStatus = hasMarketData ? "已返回" : "接口暂未返回";
  const marketDataDetail = hasMarketData
    ? "用于判断市场概率、盘口压力和价值差"
    : "当前盘口源暂未覆盖本场，不能计算真实市场差";
  const predictionRecordValue = predictionRecordLoading
    ? "同步中"
    : predictionRecord
      ? `${resultStatusLabel(predictionRecord.resultStatus)} · ${predictionRecord.market}`
      : "暂无本场记录";
  const predictionRecordDetail = predictionRecord
    ? `${predictionRecord.direction} · 置信度 ${predictionRecord.confidence}%`
    : "只有用积分预测过的比赛，才会在赛后进入历史预测";
  const historySummaryValue =
    predictionHistorySummary && predictionHistorySummary.settled > 0
      ? `${predictionHistorySummary.hitRate}% 命中`
      : "待积累";
  const historySummaryDetail = predictionHistorySummary
    ? `${predictionHistorySummary.total} 场已归档，${predictionHistorySummary.settled} 场已结算`
    : "登录后读取你的历史预测";
  const stageSummaryCards: DetailCard[] = isFinished
    ? [
        {
          label: "最终比分",
          value: `${match.homeScore} : ${match.awayScore}`,
          detail: "比赛已结束，收藏过的比赛会保留赛后数据",
          tone: "green",
        },
        {
          label: "全场技术统计",
          value: technicalDataStatus,
          detail: technicalDataDetail,
          tone: stats ? "green" : "amber",
        },
        {
          label: "本场预测记录",
          value: predictionRecordValue,
          detail: predictionRecordDetail,
          tone: predictionRecord?.resultStatus === "won" ? "green" : "neutral",
        },
        {
          label: "历史预测归档",
          value: historySummaryValue,
          detail: historySummaryDetail,
          tone:
            predictionHistorySummary && predictionHistorySummary.hitRate >= 55 ? "green" : "neutral",
        },
      ]
    : match.status === "live"
      ? [
          {
            label: "实时比分",
            value: `${match.homeScore} : ${match.awayScore}`,
            detail: matchClockText,
            tone: "green",
          },
          {
            label: "技术统计",
            value: technicalDataStatus,
            detail: technicalDataDetail,
            tone: stats ? "green" : "amber",
          },
          {
            label: "盘口/赔率",
            value: marketDataStatus,
            detail: marketDataDetail,
            tone: hasMarketData ? "green" : "amber",
          },
          {
            label: "模型当前方向",
            value: `${modelLeader.label} ${modelLeader.value}%`,
            detail: recommendationChangedText,
            tone: "green",
          },
        ]
      : [
          {
            label: "开球时间",
            value: `北京时间 ${match.kickOff}`,
            detail: "赛前先看赛程、盘口和模型基准",
            tone: "neutral",
          },
          {
            label: "盘口/赔率",
            value: marketDataStatus,
            detail: marketDataDetail,
            tone: hasMarketData ? "green" : "amber",
          },
          {
            label: "模型赛前方向",
            value: `${modelLeader.label} ${modelLeader.value}%`,
            detail: `预计比分 ${prediction.predictedScore.label}，置信度 ${prediction.confidence}%`,
            tone: "green",
          },
          {
            label: "赛中数据",
            value: "开赛后更新",
            detail: "控球、射门、角球、牌、xG、危险进攻会在接口返回后显示",
            tone: "neutral",
          },
        ];
  const dataDetailCards: DetailCard[] =
    match.status === "upcoming"
      ? [
          {
            label: "赛前能看什么",
            value: "时间 / 盘口 / 赔率 / 模型",
            detail: "适合开赛前先判断这场是否值得关注",
            tone: "green",
          },
          {
            label: "开赛后才会有",
            value: "控球 / 射门 / 角球 / 红黄牌 / xG",
            detail: "这些来自实时统计接口，未开赛不会显示假数据",
          },
          {
            label: "收藏用途",
            value: "看实时数据和提醒",
            detail: "收藏不会扣积分，适合盯盘和赛后复盘",
          },
          {
            label: "预测池用途",
            value: "用积分生成推荐",
            detail: "加入预测池后才会扣积分，并写入历史预测",
          },
        ]
      : isFinished
        ? [
            {
              label: "控球率",
              value: formatStatPair(stats?.possessionHome, stats?.possessionAway, "%"),
              detail: "主队 : 客队",
            },
            {
              label: "射门 / 射正",
              value: formatStatSlash(
                stats?.shotsHome,
                stats?.shotsAway,
                stats?.shotsOnTargetHome,
                stats?.shotsOnTargetAway
              ),
              detail: "前面是射门，后面是射正",
            },
            {
              label: "角球",
              value: formatStatPair(stats?.cornersHome, stats?.cornersAway),
              detail: "判断压制和持续进攻节奏",
            },
            {
              label: "黄红牌",
              value: stats
                ? `黄 ${formatStatNumber(stats.yellowCardsHome)}-${formatStatNumber(
                    stats.yellowCardsAway
                  )} / 红 ${formatStatNumber(stats.redCardsHome)}-${formatStatNumber(
                    stats.redCardsAway
                  )}`
                : "接口暂未返回",
              detail: "牌会影响比赛节奏和风险",
            },
            {
              label: "xG 对比",
              value: formatStatPair(stats?.xGHome, stats?.xGAway),
              detail: "衡量双方真实机会质量",
            },
            {
              label: "射门质量",
              value: stats ? `${shotQualityHome} / ${shotQualityAway}` : "接口暂未返回",
              detail: "xG ÷ 射门，越高代表机会越好",
            },
            {
              label: "盘口变化",
              value: marketSignals?.pressure ?? "接口暂未返回",
              detail: "看赛前到赛后市场方向是否变化",
            },
            {
              label: "预测偏差",
              value:
                topSignalHit == null ? "等待结算" : topSignalHit ? "方向命中" : "方向偏离",
              detail: topSignalHit == null ? "非胜平负玩法会按规则结算" : `赛前方向：${topSignal.label}`,
              tone: topSignalHit ? "green" : topSignalHit === false ? "red" : "neutral",
            },
          ]
        : [
            {
              label: "控球率",
              value: formatStatPair(stats?.possessionHome, stats?.possessionAway, "%"),
              detail: "主队 : 客队",
            },
            {
              label: "射门 / 射正",
              value: formatStatSlash(
                stats?.shotsHome,
                stats?.shotsAway,
                stats?.shotsOnTargetHome,
                stats?.shotsOnTargetAway
              ),
              detail: "前面是射门，后面是射正",
            },
            {
              label: "角球",
              value: formatStatPair(stats?.cornersHome, stats?.cornersAway),
              detail: "角球增加通常说明压制更明显",
            },
            {
              label: "黄红牌",
              value: stats
                ? `黄 ${formatStatNumber(stats.yellowCardsHome)}-${formatStatNumber(
                    stats.yellowCardsAway
                  )} / 红 ${formatStatNumber(stats.redCardsHome)}-${formatStatNumber(
                    stats.redCardsAway
                  )}`
                : "接口暂未返回",
              detail: "红牌会显著改变模型和盘口风险",
            },
            {
              label: "xG",
              value: formatStatPair(stats?.xGHome, stats?.xGAway),
              detail: "看比分背后的真实机会质量",
            },
            {
              label: "危险进攻",
              value: formatStatPair(stats?.dangerousAttacksHome, stats?.dangerousAttacksAway),
              detail: "用于判断临场压制和进球压力",
            },
            {
              label: "盘口/赔率变化",
              value: marketSignals?.pressure ?? "接口暂未返回",
              detail: marketSignals ? "市场方向已同步" : "没有盘口就不计算真实价值差",
            },
            {
              label: "冷门风险",
              value: upsetSnapshotText,
              detail: strongestMarketMove
                ? `${strongestMarketMove.label} ${formatDelta(strongestMarketMove.delta)}`
                : "没有可比盘口快照时只作模型观察",
              tone: upsetRisk >= 50 ? "amber" : "neutral",
            },
          ];
  const predictionDataNote =
    isBaselineEstimate
      ? "当前可用数据不足，以下为模型基准估算；系统会降低置信度，并在市场指数、近况或实时统计更新后重新校准。"
      : !stats
        ? "实时统计暂未更新，概率主要来自赛前信息。"
        : !odds
          ? "市场指数暂未更新，价值差暂不计算。"
          : "已结合当前可用数据计算。";
  const allocationBase = Math.max(0, Math.round(activePrefs.capital || 0));
  const recommendedExposurePercent =
    allocationBase > 0
      ? clampValue((prediction.staking.mainAmount / allocationBase) * 100, 0, prediction.staking.riskCapPercent)
      : 0;
  const riskCapPercent = Math.max(0.5, prediction.staking.riskCapPercent);
  const selectedExposurePercent = clampValue(
    customExposurePercent ?? recommendedExposurePercent,
    0,
    riskCapPercent
  );
  const backupExposurePercent = Math.min(selectedExposurePercent * 0.6, riskCapPercent * 0.6);
  const selectedPercentLabel = selectedExposurePercent.toFixed(1).replace(".0", "");
  const recommendedPercentLabel = recommendedExposurePercent.toFixed(1).replace(".0", "");
  const backupPercentLabel = backupExposurePercent.toFixed(1).replace(".0", "");
  const modelTags = activePrefs.preferred_models.length
    ? activePrefs.preferred_models.map(displayPreferenceLabel)
    : defaultPrefs.preferred_models.map(displayPreferenceLabel);
  const marketTags = activePrefs.preferred_markets.length
    ? activePrefs.preferred_markets.map(displayPreferenceLabel)
    : defaultPrefs.preferred_markets.map(displayPreferenceLabel);
  const purchaseRecommendation =
    topSignal.edge == null
      ? "市场指数暂未更新，先作为赛前观察；等待市场确认后再判断价值差。"
      : topSignal.edge <= 0
        ? "模型没有明显高于市场，建议观望或等待临场变化。"
        : selectedExposurePercent > riskCapPercent * 0.8
          ? "所选比例接近单场上限，只适合进取观察；临场数据变化要及时下调。"
          : topSignal.edge >= 5 && prediction.confidence >= 55
            ? "模型优势较清晰，可按当前比例作为本场模拟参考。"
            : "优势存在但不算强，建议低比例观察。";

  function openUpgrade() {
    setUpgradeOpen(true);
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
        body: JSON.stringify({ fixtureId }),
      });

      const json = (await res.json()) as {
        analysis?: string;
        prediction?: PredictionResult;
        orderId?: string;
        credits?: number;
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
              {match.status === "live" &&
                ` · ${typeof match.minute === "number" ? `进行中 ${match.minute}'` : "进行中"}`}
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

      <section className="rounded-2xl border border-[color:var(--accent)]/18 bg-[linear-gradient(135deg,rgba(0,255,135,0.08),rgba(0,0,0,0.18))] p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent)]">
              {deskLabel}
            </div>
            <h2 className="mt-2 text-lg font-semibold">
              {deskTitle}
            </h2>
            <p className="mt-1 text-xs leading-5 text-white/55">
              {deskDescription}
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[11px] text-white/65">
            北京时间 {match.kickOff}
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {stageSummaryCards.map((card) => (
            <DetailMetric
              key={card.label}
              label={card.label}
              value={card.value}
              detail={card.detail}
              tone={card.tone}
            />
          ))}
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-xs font-semibold text-white/70">
              {match.status === "upcoming"
                ? "赛前 / 赛中数据说明"
                : isFinished
                  ? "赛后关键数据"
                  : "赛中关键数据"}
            </div>
            {!stats && match.status !== "upcoming" && (
              <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-[10px] font-semibold text-amber-100/80">
                技术统计接口暂未返回
              </span>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            {dataDetailCards.map((card) => (
              <DetailMetric
                key={card.label}
                label={card.label}
                value={card.value}
                detail={card.detail}
                tone={card.tone}
              />
            ))}
          </div>
        </div>

        {isFinished && (
          <div className="mt-4 rounded-xl border border-white/8 bg-black/25 p-3 text-xs leading-6 text-white/60">
            <div className="font-semibold text-white">模型赛前预测复盘</div>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <div>赛前主方向：{topSignal.label}</div>
              <div>
                赛果判断：
                {topSignalHit == null ? "玩法非胜平负，等待结算" : topSignalHit ? "方向命中" : "方向偏离"}
              </div>
              <div>真实赛果：{outcomeLabel(finalOutcome)}</div>
            </div>
            <div className="mt-3 space-y-1">
              {postMatchDeviationReasons.map((reason) => (
                <div key={reason}>{reason}</div>
              ))}
            </div>
          </div>
        )}
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
              说明：当前可用数据不足，系统使用中性进球分布和基础风控参数做基准估算；市场指数、历史战绩、伤停和球员数据更新后会重新校准。
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
            {odds ? "基础价值信号" : "模型公平指数"}
          </h2>
          {!odds && (
            <p className="mt-1 text-[11px] leading-5 text-white/42">
              这里是模型按概率反推的公平指数；市场指数更新后会同时显示市场差值。
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
                    模型公平指数 {signal.fairOdds.toFixed(2)}
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
                    {signal.edge == null ? "市场待确认" : `差值 ${signal.edge}%`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-[1fr,1fr]">
        <div className="rounded-2xl border border-white/5 bg-[color:var(--card)]/90 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-sm font-semibold">实时数据对比</h2>
              <p className="mt-1 text-[11px] leading-5 text-white/45">
                这里展示数据源真实返回的比赛统计；没有返回的字段不会用演示数据填充。
              </p>
            </div>
            {!stats && match.status !== "upcoming" && (
              <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-[10px] font-semibold text-amber-100/80">
                统计源待返回
              </span>
            )}
          </div>
          <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
            {dataSourceCards.map((item) => (
              <div
                key={item.label}
                className={`rounded-xl border p-3 ${
                  item.active
                    ? "border-[color:var(--accent)]/25 bg-[color:var(--accent)]/8"
                    : "border-white/8 bg-black/25"
                }`}
              >
                <div className="text-white/45">{item.label}</div>
                <div
                  className={`mt-1 text-sm font-semibold ${
                    item.active ? "text-[color:var(--accent)]" : "text-white/70"
                  }`}
                >
                  {item.value}
                </div>
                <div className="mt-1 text-[11px] leading-5 text-white/42">{item.detail}</div>
              </div>
            ))}
          </div>
          {stats ? (
            <div className="mt-3 space-y-2">
              <StatRow label="控球率" home={stats.possessionHome} away={stats.possessionAway} isPercent />
              <StatRow label="射门" home={stats.shotsHome} away={stats.shotsAway} />
              <StatRow label="射正" home={stats.shotsOnTargetHome} away={stats.shotsOnTargetAway} />
              <StatRow label="射偏" home={stats.shotsOffTargetHome} away={stats.shotsOffTargetAway} />
              <StatRow label="角球" home={stats.cornersHome} away={stats.cornersAway} />
              <StatRow label="黄牌" home={stats.yellowCardsHome} away={stats.yellowCardsAway} />
              <StatRow label="红牌" home={stats.redCardsHome} away={stats.redCardsAway} />
              <StatRow label="危险进攻" home={stats.dangerousAttacksHome} away={stats.dangerousAttacksAway} />
              <StatRow label="禁区触球" home={stats.touchesInBoxHome} away={stats.touchesInBoxAway} />
              <StatRow label="绝佳机会" home={stats.bigChancesHome} away={stats.bigChancesAway} />
              <StatRow label="犯规" home={stats.foulsHome} away={stats.foulsAway} />
              <StatRow label="传球" home={stats.passesHome} away={stats.passesAway} />
              <StatRow label="门将扑救" home={stats.savesHome} away={stats.savesAway} />
              <StatRow label="xG" home={stats.xGHome} away={stats.xGAway} />
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-black/25 p-4 text-xs leading-6 text-white/58">
              {realtimeEmptyText}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/5 bg-[color:var(--card)]/90 p-4">
          <h2 className="text-sm font-semibold">市场指数与近况</h2>
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

          {marketSignals ? (
            <div className="mt-4 rounded-2xl border border-[color:var(--accent)]/20 bg-[linear-gradient(135deg,rgba(0,255,135,0.08),rgba(0,0,0,0.22))] p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-white">盘口资金倾向参考</h3>
                  <p className="mt-1 text-[11px] leading-5 text-white/50">
                    用开盘、最新赔率、去水概率和交易所价格推断市场压力，不再只看单一赔率。
                  </p>
                </div>
                <div className="rounded-full border border-[color:var(--accent)]/30 bg-black/35 px-3 py-1 text-[10px] font-semibold text-[color:var(--accent)]">
                  {marketSignals.source}
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {marketSignalCards.map((item) => (
                  <div key={item.label} className="rounded-xl bg-black/25 p-3">
                    <div className="text-[11px] text-white/45">{item.label}</div>
                    <div className="mt-1 text-sm font-semibold text-white">{item.value}</div>
                    <div className="mt-1 text-[11px] text-white/42">{item.detail}</div>
                  </div>
                ))}
              </div>
              {marketSignals.noVig && (
                <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
                  <div className="rounded-xl bg-black/20 p-3">
                    <div className="text-white/45">去水主胜</div>
                    <div className="mt-1 font-semibold text-[color:var(--accent)]">
                      {marketSignals.noVig.homeWin}%
                    </div>
                  </div>
                  <div className="rounded-xl bg-black/20 p-3">
                    <div className="text-white/45">去水平局</div>
                    <div className="mt-1 font-semibold text-white">{marketSignals.noVig.draw}%</div>
                  </div>
                  <div className="rounded-xl bg-black/20 p-3">
                    <div className="text-white/45">去水客胜</div>
                    <div className="mt-1 font-semibold text-red-200">
                      {marketSignals.noVig.awayWin}%
                    </div>
                  </div>
                </div>
              )}
              {marketMovementRows.length > 0 && (
                <div className="mt-3 rounded-xl border border-white/8 bg-black/25 p-3">
                  <div className="mb-2 text-[11px] font-semibold text-white/70">
                    盘口赛前到当前变化
                  </div>
                  <div className="space-y-2 text-xs">
                    {marketMovementRows.map((item) => (
                      <div key={item.label} className="grid grid-cols-[72px_1fr_72px] items-center gap-2">
                        <span className="text-white/50">{item.label}</span>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                          <div
                            className={`h-full rounded-full ${
                              item.delta >= 0 ? "bg-[color:var(--accent)]" : "bg-red-400/70"
                            }`}
                            style={{ width: `${Math.min(Math.max(item.current, 4), 96)}%` }}
                          />
                        </div>
                        <span className={item.delta >= 0 ? "text-[color:var(--accent)]" : "text-red-200"}>
                          {formatDelta(item.delta)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/45">
              盘口资金倾向暂未更新；有开盘和最新赔率后会显示抽水、去水概率、盘口升温和交易所差异。
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
              Pro 高级版 · 首单 {PRO_MONTHLY_PRICE_CNY}
            </div>
            <h2 className="text-sm font-semibold">模型委员会深度预测</h2>
            <p className="mt-1 text-[11px] text-white/50">
              市场线、市场指数、xG、比分分布和 Claude 深度解释会在这里汇总。
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
            detail="衡量基础概率、市场信号和比分分布是否互相打架。"
          />
          <ProMetric
            label="爆冷风险"
            value={`${upsetRisk}%`}
            detail="结合平局/客胜尾部概率和市场差值估算。"
          />
          <ProMetric
            label="市场线监控"
            value={isPro ? "已启用" : "待解锁"}
            detail="临场市场线变化会同步风险升降和监控提醒。"
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
                会员策略方案
              </div>
              <h3 className="text-base font-semibold">本场策略参考</h3>
              <p className="mt-1 text-xs leading-5 text-white/52">
                按你的风险偏好和模型选择，给出本场主方案、备选方案和策略占比参考。
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[11px] text-white/65">
              {prefsLoading
                ? "正在同步会员偏好"
                : isPro
                  ? `${riskLabel(activePrefs.risk_level)} · 占比建议`
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
                作为本场参考上限
              </div>
            </div>
            <div className="rounded-xl bg-black/25 p-3">
              <div className="text-[11px] text-white/45">你选择的本场比例</div>
              <div className="mt-1 text-2xl font-semibold text-white">
                {selectedPercentLabel}%
              </div>
              <div className="mt-1 text-[11px] text-white/45">
                可手动调整占比
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
              <span>调整本场占比</span>
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
                  解锁会员占比方案
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/8 bg-black/25 p-3">
              <div className="text-[11px] text-white/45">主方案</div>
              <div className="mt-1 text-base font-semibold text-white">
                {topSignal.label} · {selectedPercentLabel}% 占比
              </div>
              <div className="mt-1 text-[11px] leading-5 text-white/45">
                模型概率 {topSignal.modelProbability}% · 模型公平指数 {topSignal.fairOdds.toFixed(2)}
                {topSignal.edge == null ? " · 暂无市场差" : ` · 价值差 ${topSignal.edge}%`}
              </div>
            </div>
            <div className="rounded-xl border border-white/8 bg-black/25 p-3">
              <div className="text-[11px] text-white/45">备选方案</div>
              <div className="mt-1 text-base font-semibold text-white">
                {backupSignal.label} · {backupPercentLabel}% 占比
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
                  包含 Claude 分析、市场线异动、冷门风险、模型分歧、临场变化和风控上限。
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
              ? "点击生成后，会结合你的偏好和模型配置输出 Pro 深度分析。"
              : "免费版保留基础概率预测；Pro 会生成更完整的模型委员会报告。"}
          </div>
        )}
      </section>

      <ProPurchaseDialog
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        email={user?.email ?? membership.email}
        accessToken={session?.access_token}
        defaultPlanId={isPro ? "renewal" : "trial"}
        heading="首单 Pro 体验：把难懂的比赛先筛掉"
        description="免费版给基础概率；Pro 会把风险、热度、市场信号和 AI 解读合成一份更容易看的赛前判断。"
      />
    </div>
  );
}
