"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertItem,
  appendStoredAlerts,
  alertTypeMeta,
  buildLiveAlerts,
  readSnapshot,
  saveSnapshot,
  sendBrowserNotification,
  snapshotFromMatches,
} from "@/lib/alerts";

type LiveMatchesResponse = {
  matches?: Array<{
    id: number;
    league?: string;
    homeTeam: string;
    awayTeam: string;
    homeScore: number;
    awayScore: number;
    status: "live" | "upcoming" | "finished";
    minute?: number;
  }>;
};

const POLL_INTERVAL_MS = 60_000;

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
      const res = await fetch("/api/football/live", { cache: "no-store" });
      const json = (await res.json()) as LiveMatchesResponse;
      const matches = json.matches ?? [];
      const currentSnapshot = snapshotFromMatches(matches);
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
              {alert.match_name}
              <span className="ml-2 text-xs text-white/50">{alert.score}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-white/65">{alert.content}</p>
          </div>
        );
      })}
    </div>
  );
}
