'use client';

import { useEffect } from "react";

type MatchStatus = "live" | "upcoming" | "finished";

type MatchCard = {
  id: number;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickOff: string;
  minute?: number;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
  leagueId?: number;
};

type Props = {
  onUpdate: (newLiveMatches: MatchCard[]) => void;
};

export default function LiveMatchUpdater({ onUpdate }: Props) {
  useEffect(() => {
    async function fetchLive() {
      try {
        const res = await fetch("/api/football/live");
        const json = await res.json();
        if (Array.isArray(json.matches)) {
          onUpdate(json.matches);
        }
      } catch {
        // 保留上一次数据
      }
    }

    fetchLive();
    const id = setInterval(fetchLive, 300000);
    return () => clearInterval(id);
  }, [onUpdate]);

  return null;
}
