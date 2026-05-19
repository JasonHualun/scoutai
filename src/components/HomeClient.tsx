"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LiveMatchUpdater from "@/components/LiveMatchUpdater";
import { calculateHotScore } from "@/lib/hot-score";
import { translateLeague, translateTeam } from "@/lib/league-translations";
import { supabase } from "@/lib/supabase";
import { formatBeijingMatchTime, kickoffTime } from "@/lib/time-format";

type MatchStatus = "live" | "upcoming" | "finished";
type SortMode = "hot" | "live";

export type MatchCard = {
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

type Props = {
  initialMatches: MatchCard[];
};

const FAVORITES_KEY = "scoutai_favorites";
const SELECTED_LEAGUES_KEY = "scoutai_selected_leagues";

const DEFAULT_LEAGUE_IDS = new Set([
  39, 140, 78, 135, 61, 1, 2021, 2014, 2002, 2019, 2015, 2000,
]);

const LEAGUE_NAME_TO_ID: Record<string, number> = {
  英超: 39,
  西甲: 140,
  德甲: 78,
  法甲: 61,
  意甲: 135,
  世界杯: 1,
};

const LEAGUE_ID_ALIASES: Record<number, number[]> = {
  39: [2021],
  2021: [39],
  140: [2014],
  2014: [140],
  78: [2002],
  2002: [78],
  135: [2019],
  2019: [135],
  61: [2015],
  2015: [61],
  1: [2000],
  2000: [1],
};

const statusLabel: Record<MatchStatus, string> = {
  live: "进行中",
  upcoming: "未开赛",
  finished: "已结束",
};

function expandLeagueIds(ids: number[]): Set<number> {
  const expanded = new Set(ids);
  for (const id of ids) {
    LEAGUE_ID_ALIASES[id]?.forEach((alias) => expanded.add(alias));
  }
  return expanded;
}

function supportedLeagueIds(ids: number[]) {
  return ids.filter((id) => DEFAULT_LEAGUE_IDS.has(id));
}

function matchHotScore(match: MatchCard, favoriteLeagueIds: Set<number>) {
  return calculateHotScore({
    leagueId: match.leagueId ?? 0,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    status: match.status,
    date: match.date,
    minute: match.minute,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    isUserFavoriteLeague: !!match.leagueId && favoriteLeagueIds.has(match.leagueId),
  });
}

export default function HomeClient({ initialMatches }: Props) {
  const [sortMode, setSortMode] = useState<SortMode>("hot");
  const [favorites, setFavorites] = useState<number[]>([]);
  const [matches, setMatches] = useState<MatchCard[]>(initialMatches);
  const [selectedLeagueIds, setSelectedLeagueIds] = useState<number[]>([
    ...DEFAULT_LEAGUE_IDS,
  ]);

  useEffect(() => {
    setMatches(initialMatches);
  }, [initialMatches]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAVORITES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setFavorites(parsed);
      }
    } catch {
      setFavorites([]);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SELECTED_LEAGUES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const supported = supportedLeagueIds(parsed);
          if (supported.length > 0) {
            setSelectedLeagueIds(supported);
          }
        }
      }
    } catch {
      setSelectedLeagueIds([...DEFAULT_LEAGUE_IDS]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.user) return;

      supabase
        .from("user_preferences")
        .select("favorite_leagues")
        .eq("user_id", session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled || !data?.favorite_leagues?.length) return;
          const ids = (data.favorite_leagues as string[])
            .map((name) => LEAGUE_NAME_TO_ID[name])
            .filter((id): id is number => id !== undefined);

          const supported = supportedLeagueIds(ids);
          if (supported.length === 0) return;
          setSelectedLeagueIds(supported);
          window.localStorage.setItem(SELECTED_LEAGUES_KEY, JSON.stringify(supported));
        });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const favoriteLeagueIds = useMemo(
    () => expandLeagueIds(selectedLeagueIds),
    [selectedLeagueIds]
  );

  const activeMatches = useMemo(() => {
    return matches.filter((match) => {
      if (match.status === "finished") return false;
      if (selectedLeagueIds.length === 0) return false;
      return !!match.leagueId && favoriteLeagueIds.has(match.leagueId);
    });
  }, [favoriteLeagueIds, matches, selectedLeagueIds.length]);

  const sortedMatches = useMemo(() => {
    const list = [...activeMatches];

    if (sortMode === "hot") {
      return list.sort((a, b) => {
        const hotDiff =
          matchHotScore(b, favoriteLeagueIds) - matchHotScore(a, favoriteLeagueIds);
        if (hotDiff !== 0) return hotDiff;
        return kickoffTime(a.date) - kickoffTime(b.date);
      });
    }

    return list.sort((a, b) => {
      const timeDiff = kickoffTime(a.date) - kickoffTime(b.date);
      if (timeDiff !== 0) return timeDiff;
      return matchHotScore(b, favoriteLeagueIds) - matchHotScore(a, favoriteLeagueIds);
    });
  }, [activeMatches, favoriteLeagueIds, sortMode]);

  const liveCount = activeMatches.filter((match) => match.status === "live").length;
  const upcomingCount = activeMatches.filter((match) => match.status === "upcoming").length;

  function toggleFavorite(id: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setFavorites((prev) => {
      const next = prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id];
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  }

  const handleLiveUpdate = useMemo(
    () => (newLiveMatches: MatchCard[]) => {
      setMatches((prev) => {
        const liveMap = new Map(newLiveMatches.map((match) => [match.id, match]));
        const updated = prev.map((match) => liveMap.get(match.id) ?? match);
        const existingIds = new Set(prev.map((match) => match.id));
        const brandNew = newLiveMatches.filter((match) => !existingIds.has(match.id));
        return [...brandNew, ...updated];
      });
    },
    []
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--accent)]/80">
            Live Market Board
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
            热门赛事
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
            聚合实时比分、赛程、赔率和热度信号，优先展示更值得跟踪的比赛。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {(["hot", "live"] as SortMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSortMode(mode)}
              className={`rounded-full border px-3 py-1.5 transition ${
                sortMode === mode
                  ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-black"
                  : "border-white/15 bg-black/30 text-white/60 hover:text-white"
              }`}
            >
              {mode === "hot" ? "热门排序" : "实时优先"}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { label: "关注赛事", value: activeMatches.length },
          { label: "进行中", value: liveCount },
          { label: "未开赛", value: upcomingCount },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-white/5 bg-[color:var(--card)]/80 p-4"
          >
            <div className="text-[11px] text-white/45">{item.label}</div>
            <div className="mt-1 text-2xl font-semibold text-white">{item.value}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-[2fr,1fr]">
        <div className="space-y-3">
          {sortedMatches.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-[color:var(--card)]/60 p-8 text-sm text-white/60">
              暂无符合条件的比赛。可以在设置里调整关注联赛，或稍后刷新。
            </div>
          ) : (
            <>
              <LiveMatchUpdater onUpdate={handleLiveUpdate} />
              {sortedMatches.map((match) => {
                const isFavorite = favorites.includes(match.id);
                const hotScore = matchHotScore(match, favoriteLeagueIds);

                return (
                  <div key={match.id} className="relative">
                    <Link
                      href={`/match/${match.id}`}
                      className="group block rounded-2xl border border-white/5 bg-[color:var(--card)]/85 p-4 shadow-[0_16px_60px_rgba(0,0,0,0.55)] ring-1 ring-black/30 transition hover:-translate-y-0.5 hover:border-[color:var(--accent)]/60"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-medium uppercase tracking-[0.16em] text-[color:var(--accent)]/80">
                            {translateLeague(match.league)}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/80">
                            <span>{translateTeam(match.homeTeam)}</span>
                            <span className="text-xs text-white/35">vs</span>
                            <span>{translateTeam(match.awayTeam)}</span>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                          <span className="text-xs text-white/50">
                            {statusLabel[match.status]} ·{" "}
                            北京时间 {formatBeijingMatchTime(match.date, match.kickOff)}
                          </span>
                          {match.status === "live" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                              {match.minute ?? 0}&apos;
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-5 flex items-center justify-between gap-4">
                        <div className="flex items-baseline gap-2 text-2xl font-semibold">
                          <span>{match.homeScore}</span>
                          <span className="text-sm text-white/35">:</span>
                          <span>{match.awayScore}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-[11px] text-white/45">热度指数</div>
                            <div className="text-sm font-semibold text-[color:var(--accent)]">
                              {hotScore}
                            </div>
                          </div>
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-white/5">
                            <div
                              className="h-full rounded-full bg-[color:var(--accent)] shadow-[0_0_24px_rgba(0,255,135,0.7)]"
                              style={{ width: `${hotScore}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between text-[11px] text-white/45">
                        <span>查看概率预测、赔率分析和 AI 解读</span>
                        <span className="text-[color:var(--accent)]/80 transition group-hover:translate-x-0.5">
                          详情 →
                        </span>
                      </div>
                    </Link>

                    <button
                      type="button"
                      onClick={(event) => toggleFavorite(match.id, event)}
                      aria-label={isFavorite ? "取消收藏" : "收藏比赛"}
                      className={`absolute bottom-4 right-16 z-10 text-xl transition hover:scale-110 ${
                        isFavorite ? "text-yellow-300" : "text-white/30 hover:text-white/70"
                      }`}
                    >
                      {isFavorite ? "★" : "☆"}
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-[color:var(--accent)]/25 bg-[color:var(--card)]/90 p-4 shadow-[0_18px_75px_rgba(0,0,0,0.65)]">
            <h2 className="text-sm font-semibold tracking-tight">今日监控概览</h2>
            <p className="mt-2 text-xs leading-5 text-white/60">
              当前为{sortMode === "hot" ? "热门排序：按热度指数从高到低展示。" : "实时优先：按北京时间开赛先后展示。"}
            </p>
          </div>

          <div className="rounded-2xl border border-white/5 bg-[color:var(--card)]/80 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">
              模型说明
            </h3>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-white/60">
              <li>· 热门排序综合联赛权重、豪门球队、开赛时间和实时比分紧张度。</li>
              <li>· 实时优先只看北京时间先后，方便你按今晚赛程顺序查看。</li>
              <li>· 详情页会用 xG、赔率去水概率和泊松比分分布生成胜平负概率。</li>
              <li>· 大模型只负责解释和风控表达，数学概率由本地模型先计算。</li>
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
}
