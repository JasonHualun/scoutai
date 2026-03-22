'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import LiveMatchUpdater from "@/components/LiveMatchUpdater";
import { useAuthStore } from "@/lib/authStore";
import { supabase } from "@/lib/supabase";
import { translateLeague, translateTeam } from "@/lib/league-translations";
import { calculateHotScore } from "@/lib/hot-score";

type MatchStatus = "live" | "upcoming" | "finished";

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

const statusLabel: Record<MatchStatus, string> = {
  live: "进行中",
  upcoming: "即将开始",
  finished: "已结束",
};

type SortMode = "live" | "hot";

type Props = {
  initialMatches: MatchCard[];
};

const FAVORITES_KEY = "scoutai_favorites";
const SELECTED_LEAGUES_KEY = "scoutai_selected_leagues";
const DEFAULT_LEAGUE_IDS = new Set([
  // 五大联赛
  39, 140, 78, 135, 61,
  // 欧洲杯赛
  2, 3, 4, 1, 12, 20,
  // 其他热门联赛
  94, 106, 144, 128, 71, 119,
  // 亚洲
  17, 292,
  // football-data.org IDs
  2021, 2002, 2014, 2019, 2015, 2001, 2000, 2018, 2152,
]);

function formatMatchTime(kickOff: string, dateStr?: string): string {
  if (!dateStr) return kickOff;
  const tz = { timeZone: "Asia/Shanghai" };
  const today = new Date().toLocaleDateString("zh-CN", tz);
  const matchDay = new Date(dateStr).toLocaleDateString("zh-CN", tz);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString("zh-CN", tz);
  if (matchDay === today) return kickOff;
  if (matchDay === tomorrow) return `明天 ${kickOff}`;
  // zh-CN gives "YYYY/M/D", extract M and D with zero-padding
  const [, m, d] = new Date(dateStr).toLocaleDateString("zh-CN", tz).split("/");
  return `${m.padStart(2, "0")}/${d.padStart(2, "0")} ${kickOff}`;
}


const LEAGUE_NAME_TO_ID: Record<string, number> = {
  英超: 39, 西甲: 140, 德甲: 78, 法甲: 61, 意甲: 135,
  欧冠: 2, 欧联杯: 3, 欧会杯: 848,
  世界杯: 1, 欧洲杯: 4, 亚洲杯: 5, 美洲杯: 9,
  亚冠: 17, 中超: 169, 日职联: 98, "韩K联赛": 292, 澳超: 188,
  MLS: 253, 土超: 203, 荷甲: 88, 葡超: 94, 苏超: 113,
};

// api-football ID ↔ football-data.org ID 双向映射（两套数据源 ID 不同）
const LEAGUE_ID_ALIASES: Record<number, number[]> = {
  39: [2021], 2021: [39],     // 英超
  140: [2014], 2014: [140],   // 西甲
  78: [2002], 2002: [78],     // 德甲
  135: [2019], 2019: [135],   // 意甲
  61: [2015], 2015: [61],     // 法甲
  2: [2001], 2001: [2],       // 欧冠
  4: [2018], 2018: [4],       // 欧洲杯
  1: [2000], 2000: [1],       // 世界杯
  12: [2152], 2152: [12],     // 美洲杯
};

function expandLeagueIds(ids: number[]): Set<number> {
  const expanded = new Set(ids);
  for (const id of ids) {
    LEAGUE_ID_ALIASES[id]?.forEach((alias) => expanded.add(alias));
  }
  return expanded;
}

export default function HomeClient({ initialMatches }: Props) {
  const { user } = useAuthStore();
  const [sortMode, setSortMode] = useState<SortMode>("hot");
  const [favorites, setFavorites] = useState<number[]>([]);
  const [matches, setMatches] = useState<MatchCard[]>(initialMatches);
  const [selectedLeagueIds, setSelectedLeagueIds] = useState<number[]>([...DEFAULT_LEAGUE_IDS]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // 当 initialMatches 更新时，同步到 state
  useEffect(() => {
    setMatches(initialMatches);
  }, [initialMatches]);

  // 过滤已结束比赛 + 联赛偏好（含跨数据源 ID 扩展）
  const activeMatches = useMemo(() => {
    const expandedIds = expandLeagueIds(selectedLeagueIds);
    return matches.filter((m) => {
      if (m.status === "finished") return false;
      if (!showFavoritesOnly || selectedLeagueIds.length === 0) return true;
      // leagueId 为 0 或 undefined 时过滤掉（无法判断归属）
      return !!m.leagueId && expandedIds.has(m.leagueId);
    });
  }, [matches, selectedLeagueIds, showFavoritesOnly]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(FAVORITES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setFavorites(parsed);
      }
    } catch {
      // 忽略本地解析错误
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(SELECTED_LEAGUES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSelectedLeagueIds(parsed);
          setShowFavoritesOnly(true);
        }
      }
    } catch {
      // 忽略本地解析错误
    }
  }, []);

  // 每次挂载时从 Supabase 同步（直接读 session，不依赖 auth store 初始化时序）
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
          if (ids.length === 0) return;
          setSelectedLeagueIds(ids);
          setShowFavoritesOnly(true);
          window.localStorage.setItem(SELECTED_LEAGUES_KEY, JSON.stringify(ids));
        });
    });
    return () => { cancelled = true; };
  }, []);

  function toggleFavorite(id: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setFavorites((prev) => {
      const exists = prev.includes(id);
      const next = exists ? prev.filter((x) => x !== id) : [...prev, id];
      if (typeof window !== "undefined") {
        window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      }
      return next;
    });
  }

  const sortedMatches = useMemo(() => {
    if (sortMode === "hot") {
      const favSet = expandLeagueIds(selectedLeagueIds);
      return [...activeMatches].sort((a, b) => {
        const scoreA = calculateHotScore({
          leagueId: a.leagueId ?? 0,
          homeTeam: a.homeTeam,
          awayTeam: a.awayTeam,
          status: a.status,
          date: a.date,
          minute: a.minute,
          homeScore: a.homeScore,
          awayScore: a.awayScore,
          isUserFavoriteLeague: !!a.leagueId && favSet.has(a.leagueId),
        });
        const scoreB = calculateHotScore({
          leagueId: b.leagueId ?? 0,
          homeTeam: b.homeTeam,
          awayTeam: b.awayTeam,
          status: b.status,
          date: b.date,
          minute: b.minute,
          homeScore: b.homeScore,
          awayScore: b.awayScore,
          isUserFavoriteLeague: !!b.leagueId && favSet.has(b.leagueId),
        });
        return scoreB - scoreA;
      });
    }
    // sortMode === "live"：进行中在前，再按开赛时间
    const order: Record<MatchStatus, number> = { live: 0, upcoming: 1, finished: 2 };
    return [...activeMatches].sort((a, b) => {
      const ao = order[a.status] ?? 2;
      const bo = order[b.status] ?? 2;
      if (ao !== bo) return ao - bo;
      return new Date(a.date ?? "").getTime() - new Date(b.date ?? "").getTime();
    });
  }, [activeMatches, sortMode, selectedLeagueIds]);

  const handleLiveUpdate = useMemo(() => (newLiveMatches: MatchCard[]) => {
    setMatches(prev => {
      const liveMap = new Map(newLiveMatches.map(m => [m.id, m]));
      const updated = prev.map(m => liveMap.has(m.id) ? liveMap.get(m.id)! : m);
      const existingIds = new Set(prev.map(m => m.id));
      const brandNew = newLiveMatches.filter(m => !existingIds.has(m.id));
      return [...brandNew, ...updated];
    });
  }, []);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              热门赛事
            </h1>
            <p className="mt-1 text-sm text-white/60">
              基于 API-Football 的实时赛程、比分与统计数据。
            </p>
          </div>
          <div className="mt-2 flex gap-2 text-xs">
            {(["live", "hot"] as SortMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSortMode(mode)}
                className={`rounded-full px-3 py-1 border ${
                  sortMode === mode
                    ? "bg-[color:var(--accent)] text-black border-[color:var(--accent)]"
                    : "border-white/20 text-[#888888] bg-transparent"
                }`}
              >
                {mode === "live" ? "⚡ 实时" : "🔥 热门"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {selectedLeagueIds.length > 0 && (
            <button
              type="button"
              onClick={() => setShowFavoritesOnly((v) => !v)}
              className={`rounded-full border px-3 py-1 transition ${
                showFavoritesOnly
                  ? "border-[color:var(--accent)]/60 bg-[color:var(--accent)]/10 text-[color:var(--accent)]"
                  : "border-white/15 bg-transparent text-white/50 hover:text-white/80"
              }`}
            >
              {showFavoritesOnly
                ? `★ 关注联赛 · ${activeMatches.length} 场`
                : "☆ 查看所有联赛"}
            </button>
          )}
          <span className="rounded-full bg-[color:var(--accent)]/10 px-3 py-1 text-[color:var(--accent)]">
            ⚡ 实时刷新中（每 30 秒）
          </span>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-[2fr,1.2fr]">
        <div className="space-y-3">
          {sortedMatches.length === 0 ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={idx}
                  className="animate-pulse rounded-2xl border border-white/5 bg-[color:var(--card)]/80 p-4"
                >
                  <div className="flex justify-between gap-3">
                    <div className="space-y-2">
                      <div className="h-3 w-24 rounded bg-white/10" />
                      <div className="h-4 w-40 rounded bg-white/10" />
                    </div>
                    <div className="h-4 w-16 rounded bg-white/10" />
                  </div>
                  <div className="mt-4 h-3 w-full rounded-full bg-white/5" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <LiveMatchUpdater onUpdate={handleLiveUpdate} />
              {sortedMatches.map((match) => {
                const isFav = favorites.includes(match.id);
                return (
                  <div key={match.id} className="relative">
                    <Link
                      href={`/match/${match.id}`}
                      className="group block rounded-2xl border border-white/5 bg-[color:var(--card)]/80 p-4 shadow-[0_16px_60px_rgba(0,0,0,0.6)] ring-1 ring-black/40 backdrop-blur transition hover:-translate-y-0.5 hover:border-[color:var(--accent)]/60 hover:shadow-[0_24px_80px_rgba(0,0,0,0.9)]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--accent)]/80">
                            {translateLeague(match.league)}
                          </span>
                          <div className="flex items-center gap-2 text-sm text-white/70">
                            <span>{translateTeam(match.homeTeam)}</span>
                            <span className="text-xs text-white/40">vs</span>
                            <span>{translateTeam(match.awayTeam)}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-right">
                          <span className="text-xs text-white/50">
                            {statusLabel[match.status]} · {formatMatchTime(match.kickOff, match.date)}
                          </span>
                          {match.status === "live" && match.minute && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                              {match.minute}&apos;
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-4">
                        <div className="flex items-baseline gap-2 text-lg font-semibold">
                          <span>{match.homeScore}</span>
                          <span className="text-xs text-white/40">:</span>
                          <span>{match.awayScore}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col items-end text-xs text-white/60">
                            <span>热度指数</span>
                            <span className="text-sm font-semibold text-[color:var(--accent)]">
                              {calculateHotScore({ leagueId: match.leagueId ?? 0, homeTeam: match.homeTeam, awayTeam: match.awayTeam, status: match.status, date: match.date, minute: match.minute, homeScore: match.homeScore, awayScore: match.awayScore })}
                            </span>
                          </div>
                          <div className="relative h-8 w-28 overflow-hidden rounded-full bg-white/5">
                            <div className="absolute inset-0 bg-gradient-to-r from-[color:var(--accent)]/40 via-[color:var(--accent)] to-[color:var(--accent)]/20 opacity-60" />
                            <div
                              className="relative h-full rounded-full bg-[color:var(--accent)] shadow-[0_0_30px_rgba(0,255,135,0.8)]"
                              style={{ width: `${calculateHotScore({ leagueId: match.leagueId ?? 0, homeTeam: match.homeTeam, awayTeam: match.awayTeam, status: match.status, date: match.date, minute: match.minute, homeScore: match.homeScore, awayScore: match.awayScore })}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-[11px] text-white/45">
                        <span>点击查看详细数据面板与事件时间轴</span>
                        <span className="flex items-center gap-1 text-[color:var(--accent)]/80">
                          详情
                          <span className="translate-x-0 transition group-hover:translate-x-0.5">→</span>
                        </span>
                      </div>
                    </Link>
                    <button
                      type="button"
                      onClick={(e) => toggleFavorite(match.id, e)}
                      className={`absolute bottom-4 right-16 z-10 text-xl cursor-pointer transition-transform hover:scale-125 ${
                        isFav ? "text-yellow-400" : "text-white/30 hover:text-white/60"
                      }`}
                    >
                      {isFav ? "★" : "☆"}
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-[color:var(--accent)]/30 bg-[color:var(--card)]/90 p-4 shadow-[0_18px_75px_rgba(0,0,0,0.85)]">
            <h2 className="text-sm font-semibold tracking-tight">
              今日监控总览
            </h2>
            <p className="mt-1 text-xs text-white/60">
              这里展示今日总比赛数、进行中的比赛和你关注的联赛。
            </p>
          </div>

          <div className="rounded-2xl border border-white/5 bg-[color:var(--card)]/80 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">
              功能预览
            </h3>
            <ul className="mt-3 space-y-2 text-xs text-white/60">
              <li>· 比赛详情页：时间轴、xG 曲线、危险进攻分布</li>
              <li>· 收藏页：自定义关注列表 & 通知策略</li>
              <li>· 异常提醒页：盘口 / 射门 / 控球异常聚合视图</li>
              <li>· 设置页：联赛过滤、模型阈值、自定义主题</li>
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
}

