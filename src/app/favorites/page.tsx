"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { translateLeague, translateTeam } from "@/lib/league-translations";

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

const FAVORITES_KEY = "scoutai_favorites";

const statusLabel: Record<MatchStatus, string> = {
  live: "进行中",
  upcoming: "未开赛",
  finished: "已结束",
};

function mapFixtureToMatchCard(fixture: FixtureLike): MatchCard {
  const statusShort = fixture.fixture.status.short;
  let status: MatchStatus = "upcoming";
  if (["1H", "2H", "ET", "BT"].includes(statusShort)) status = "live";
  else if (["FT", "AET", "PEN"].includes(statusShort)) status = "finished";

  const date = new Date(fixture.fixture.date);
  const rawHours = date.getUTCHours() + 8;
  const hours = String(rawHours >= 24 ? rawHours - 24 : rawHours).padStart(2, "0");
  const mins = String(date.getUTCMinutes()).padStart(2, "0");

  return {
    id: fixture.fixture.id,
    leagueId: fixture.league.id,
    league: `${fixture.league.name} · ${fixture.league.round ?? ""}`.trim(),
    homeTeam: fixture.teams.home.name,
    awayTeam: fixture.teams.away.name,
    kickOff: `${hours}:${mins}`,
    minute: fixture.fixture.status.elapsed ?? undefined,
    homeScore: fixture.goals.home ?? 0,
    awayScore: fixture.goals.away ?? 0,
    status,
  };
}

export default function FavoritesPage() {
  const [favoriteMatches, setFavoriteMatches] = useState<MatchCard[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

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

  function handleUnfavorite(id: number) {
    const updated = favoriteIds.filter((favoriteId) => favoriteId !== id);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
    setFavoriteIds(updated);
    setFavoriteMatches((prev) => prev.filter((match) => match.id !== id));
  }

  const isEmpty = !loading && favoriteMatches.length === 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">收藏</h1>
        <p className="mt-2 text-sm text-white/60">
          你关注的比赛会显示在这里，方便快速进入数据面板和 AI 分析。
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-[color:var(--card)]/70 p-6 text-sm text-white/60">
          加载收藏中...
        </div>
      ) : isEmpty ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-[color:var(--card)]/60 p-6 text-sm text-white/60">
          <div className="mb-3 text-base text-white/75">暂无收藏比赛</div>
          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-[color:var(--accent)]/60 px-3 py-1.5 text-xs text-[color:var(--accent)] hover:bg-[color:var(--accent)]/10"
          >
            返回热门赛事
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {favoriteMatches.map((match) => (
            <div
              key={match.id}
              className="flex items-center gap-4 rounded-2xl border border-white/5 bg-[color:var(--card)]/80 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
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
                onClick={() => handleUnfavorite(match.id)}
                className="shrink-0 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[11px] text-white/70 hover:border-red-400/60 hover:text-red-300"
              >
                取消收藏
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
