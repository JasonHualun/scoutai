'use client';

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

function mapFixtureToMatchCard(fixture: any): MatchCard {
  const statusShort = fixture.fixture.status.short as string;
  let status: MatchStatus = "upcoming";
  if (["1H", "2H", "ET", "BT"].includes(statusShort)) status = "live";
  else if (["FT", "AET", "PEN"].includes(statusShort)) status = "finished";

  const fixtureDate = fixture.fixture.date;
  const d = new Date(fixtureDate);
  const rawHours = d.getUTCHours() + 8;
  const hours = String(rawHours >= 24 ? rawHours - 24 : rawHours).padStart(2, "0");
  const mins = String(d.getUTCMinutes()).padStart(2, "0");

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

const statusLabel: Record<MatchStatus, string> = {
  live: "进行中",
  upcoming: "即将开始",
  finished: "已结束",
};

const FAVORITES_KEY = "scoutai_favorites";

export default function FavoritesPage() {
  const [favoriteMatches, setFavoriteMatches] = useState<MatchCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);

  useEffect(() => {
    async function load() {
      try {
        // 1. 从 localStorage 读取收藏的 ID 列表
        const raw = localStorage.getItem(FAVORITES_KEY);
        const ids: number[] = raw ? JSON.parse(raw) : [];
        setFavoriteIds(ids);

        if (ids.length === 0) {
          setLoading(false);
          return;
        }

        // 2. 调用 /api/football/all 获取今日+进行中比赛
        const res = await fetch("/api/football/all");
        const json = await res.json();

        if (Array.isArray(json.fixtures)) {
          const idSet = new Set(ids.map(String));
          const filtered = json.fixtures
            .filter((f: any) => idSet.has(String(f.fixture.id)))
            .map(mapFixtureToMatchCard);
          setFavoriteMatches(filtered);
        }
      } catch (error) {
        console.error("加载收藏失败:", error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  function handleUnfavorite(id: number) {
    // 更新 localStorage
    const updated = favoriteIds.filter((fid) => fid !== id);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
    setFavoriteIds(updated);

    // 更新显示列表
    setFavoriteMatches((prev) => prev.filter((m) => m.id !== id));
  }

  const isEmpty = !loading && favoriteMatches.length === 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">收藏</h1>
      <p className="text-sm text-white/60">
        这里展示你关注的比赛列表，方便快速进入详情与数据面板。
      </p>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-[color:var(--card)]/70 p-6 text-sm text-white/60">
          加载中…
        </div>
      ) : isEmpty ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-[color:var(--card)]/60 p-6 text-sm text-white/60">
          <div className="mb-1 text-base">
            <span className="mr-1">⭐</span>暂无收藏比赛，去首页收藏你感兴趣的比赛吧
          </div>
          <Link
            href="/"
            className="mt-2 inline-flex items-center rounded-full border border-[color:var(--accent)]/60 px-3 py-1.5 text-xs text-[color:var(--accent)] hover:bg-[color:var(--accent)]/10"
          >
            返回热门赛事
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {favoriteMatches.map((match) => (
            <div
              key={match.id}
              className="relative flex items-center gap-4 rounded-2xl border border-white/5 bg-[color:var(--card)]/80 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.7)]"
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
                      <span className="ml-2 text-red-400">
                        {match.minute}&apos;
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-lg font-semibold">
                    {match.homeScore}
                    <span className="mx-1 text-xs text-white/40">:</span>
                    {match.awayScore}
                  </div>
                  {match.status === "live" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                      LIVE
                    </span>
                  )}
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
