"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertItem,
  LiveAlertMatch,
  appendStoredAlerts,
  alertTypeMeta,
  buildLiveAlerts,
  removeStoredAlertsForMatchIds,
  readSnapshot,
  saveSnapshot,
  sendBrowserNotification,
  snapshotFromMatches,
} from "@/lib/alerts";
import {
  cleanupStoredMatchPools,
  readFavoriteIds as readStoredFavoriteIds,
} from "@/lib/match-pools";
import { translateTeam, translateTeamText } from "@/lib/league-translations";

type LiveMatchesResponse = {
  matches?: LiveAlertMatch[];
};

type FixtureLike = {
  fixture: {
    id: number;
    date?: string | null;
    status?: { short?: string | null };
  };
};

const POLL_INTERVAL_MS = 60_000;
const MAX_ENRICHED_MATCHES = 12;

type ApiStatItem = { type: string; value: number | string | null };
type ApiTeamStats = { statistics?: ApiStatItem[] };
type ApiBet = {
  name: string;
  values?: Array<{ value: string; odd?: string }>;
};
type MatchDetailResponse = {
  statistics?: { response?: ApiTeamStats[] } | null;
  odds?: { response?: Array<{ bookmakers?: Array<{ bets?: ApiBet[] }> }> } | null;
};

function readFavoriteIds() {
  return new Set(readStoredFavoriteIds().map(String));
}

function statValue(items: ApiStatItem[] | undefined, type: string) {
  const item = items?.find((stat) => stat.type === type);
  if (!item) return undefined;
  const raw =
    typeof item.value === "string" ? Number(item.value.replace("%", "")) : item.value;
  return Number.isFinite(raw) ? Number(raw) : undefined;
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

async function enrichMatch(match: LiveAlertMatch): Promise<LiveAlertMatch> {
  try {
    const res = await fetch(`/api/match/${match.id}`, { cache: "no-store" });
    if (!res.ok) return match;

    const detail = (await res.json()) as MatchDetailResponse;
    const homeStats = detail.statistics?.response?.[0]?.statistics;
    const awayStats = detail.statistics?.response?.[1]?.statistics;
    const bets = detail.odds?.response?.[0]?.bookmakers?.[0]?.bets;
    const enriched: LiveAlertMatch = {
      ...match,
      homeTeam: translateTeam(match.homeTeam),
      awayTeam: translateTeam(match.awayTeam),
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
      ...enriched,
      ...buildUpsetSignal(enriched),
    };
  } catch {
    return match;
  }
}

async function enrichMatches(matches: LiveAlertMatch[]) {
  const selected = matches.slice(0, MAX_ENRICHED_MATCHES);
  const results = await Promise.allSettled(selected.map(enrichMatch));
  const enriched = results.map((result, index) =>
    result.status === "fulfilled" ? result.value : selected[index]
  );
  return [...enriched, ...matches.slice(MAX_ENRICHED_MATCHES)];
}

async function cleanupClosedFavoriteMatches() {
  const favoriteIds = readFavoriteIds();
  if (!favoriteIds.size) return;

  try {
    const res = await fetch("/api/football/all", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as { fixtures?: FixtureLike[] };
    const fixtures = json.fixtures ?? [];
    if (fixtures.length === 0) return;

    const cleanup = cleanupStoredMatchPools(
      fixtures.map((fixture) => ({
        id: fixture.fixture.id,
        status: fixture.fixture.status?.short,
        date: fixture.fixture.date,
      })),
      { removeMissing: true }
    );

    if (cleanup.removedIds.length > 0) {
      removeStoredAlertsForMatchIds(cleanup.removedIds);
    }
  } catch {
    // Alert polling should remain quiet if the schedule refresh fails.
  }
}

export function AlertNotifier() {
  const [toastAlerts, setToastAlerts] = useState<AlertItem[]>([]);

  const publishAlerts = useCallback((alerts: AlertItem[]) => {
    const fresh = appendStoredAlerts(alerts);
    if (!fresh.length) return;

    setToastAlerts((current) => [...fresh, ...current].slice(0, 3));
    fresh.forEach(sendBrowserNotification);
  }, []);

  const checkLiveMatches = useCallback(async () => {
    try {
      await cleanupClosedFavoriteMatches();
      const favoriteIds = readFavoriteIds();
      if (!favoriteIds.size) {
        saveSnapshot({});
        return;
      }

      const res = await fetch("/api/football/live", { cache: "no-store" });
      const json = (await res.json()) as LiveMatchesResponse;
      const matches = (json.matches ?? []).filter((match) =>
        favoriteIds.has(String(match.id))
      );
      const enrichedMatches = await enrichMatches(matches);
      const currentSnapshot = snapshotFromMatches(enrichedMatches);
      const previousSnapshot = readSnapshot();

      saveSnapshot(currentSnapshot);
      if (!previousSnapshot) return;

      publishAlerts(buildLiveAlerts(previousSnapshot, currentSnapshot));
    } catch {
      // Network interruptions should not disturb the rest of the app.
    }
  }, [publishAlerts]);

  useEffect(() => {
    const initialCheck = window.setTimeout(checkLiveMatches, 0);
    const interval = window.setInterval(checkLiveMatches, POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") checkLiveMatches();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearTimeout(initialCheck);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkLiveMatches]);

  useEffect(() => {
    if (!toastAlerts.length) return;
    const timer = window.setTimeout(() => {
      setToastAlerts((current) => current.slice(0, -1));
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [toastAlerts]);

  if (!toastAlerts.length) return null;

  return (
    <div className="fixed right-4 top-24 z-50 w-[min(360px,calc(100vw-32px))] space-y-2">
      {toastAlerts.map((alert) => {
        const meta = alertTypeMeta[alert.type];
        return (
          <div
            key={alert.id}
            className="rounded-2xl border border-[color:var(--accent)]/35 bg-[#07120e]/95 p-4 shadow-[0_22px_70px_rgba(0,0,0,0.75)] backdrop-blur-xl"
          >
            <div className="flex items-center justify-between gap-3">
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.bg} ${meta.tone}`}
              >
                {meta.label}
              </span>
              <button
                type="button"
                onClick={() =>
                  setToastAlerts((current) =>
                    current.filter((item) => item.id !== alert.id)
                  )
                }
                className="text-xs text-white/45 hover:text-white"
              >
                关闭
              </button>
            </div>
            <div className="mt-2 text-sm font-semibold text-white">
              {translateTeamText(alert.match_name)}
              <span className="ml-2 text-xs text-white/50">{alert.score}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-white/65">
              {translateTeamText(alert.content)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
