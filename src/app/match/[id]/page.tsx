'use client';

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/authStore";
import { translateLeague, translateTeam } from "@/lib/league-translations";

type MatchStatus = "live" | "upcoming" | "finished";

type Match = {
  id: string;
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
  opening: {
    homeWin: number;
    draw: number;
    awayWin: number;
    handicap: string;
    overUnder: string;
  };
  live: {
    homeWin: number;
    draw: number;
    awayWin: number;
    handicap: string;
    overUnder: string;
  };
  upsetProbability: number;
};

type RecentForm = ("W" | "D" | "L")[];

const fallbackStats: RealtimeStats = {
  possessionHome: 50,
  possessionAway: 50,
  shotsHome: 10,
  shotsAway: 8,
  shotsOnTargetHome: 5,
  shotsOnTargetAway: 3,
  cornersHome: 4,
  cornersAway: 4,
  yellowCardsHome: 1,
  yellowCardsAway: 1,
  dangerousAttacksHome: 30,
  dangerousAttacksAway: 25,
  xGHome: 1.4,
  xGAway: 1.1,
};

const fallbackOdds: OddsData = {
  opening: {
    homeWin: 2.0,
    draw: 3.5,
    awayWin: 3.8,
    handicap: "主让 0.5",
    overUnder: "2.5 大球",
  },
  live: {
    homeWin: 1.8,
    draw: 3.8,
    awayWin: 4.2,
    handicap: "主让 0.75",
    overUnder: "2.75 大球",
  },
  upsetProbability: 10,
};

const fallbackForm: { home: RecentForm; away: RecentForm } = {
  home: ["W", "D", "W", "L", "W"],
  away: ["L", "W", "D", "D", "W"],
};

function PaywalledContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[color:var(--accent)]/20 bg-black/40">
      <div className="pointer-events-none blur-sm">
        <div className="opacity-75">{children}</div>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black/90" />
      <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--accent)]">
          ScoutAI · 高级策略
        </div>
        <p className="max-w-xs text-xs text-white/70">
          解锁完整投资建议与爆冷概率，需要开通会员或连接授权账号。
        </p>
        <button className="mt-1 rounded-full bg-[color:var(--accent)] px-4 py-1.5 text-xs font-semibold text-black shadow-[0_0_30px_rgba(0,255,135,0.8)] transition hover:bg-emerald-300">
          解锁高级会员
        </button>
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
  const awayPct = (away / total) * 100;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-black/30 px-3 py-2 text-xs">
      <div className="flex w-10 justify-start font-mono text-[10px] text-white/70">
        {isPercent ? `${home}%` : home}
      </div>
      <div className="flex-1">
        <div className="flex justify-between text-[11px] text-white/50">
          <span>{label}</span>
          <span className="font-mono text-[10px] text-white/40">
            {isPercent ? `${away}%` : away}
          </span>
        </div>
        <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full bg-[color:var(--accent)]"
            style={{ width: `${homePct}%` }}
          />
          <div
            className="h-full bg-red-500/70"
            style={{ width: `${awayPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function FormBadge({ result }: { result: "W" | "D" | "L" }) {
  const map: Record<"W" | "D" | "L", { label: string; className: string }> = {
    W: {
      label: "胜",
      className:
        "bg-emerald-500/20 text-emerald-300 border-emerald-400/40 shadow-[0_0_20px_rgba(16,185,129,0.4)]",
    },
    D: {
      label: "平",
      className: "bg-slate-500/20 text-slate-200 border-slate-400/40",
    },
    L: {
      label: "负",
      className: "bg-red-500/20 text-red-300 border-red-400/40",
    },
  };
  const cfg = map[result];
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

export default function MatchDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const resolvedParams = React.use(params as any);
  const fixtureId = Number(resolvedParams.id);

  const fallbackMatch: Match = {
    id: "unknown",
    league: "未知联赛",
    homeTeam: "主队",
    awayTeam: "客队",
    kickOff: "--:--",
    minute: 0,
    homeScore: 0,
    awayScore: 0,
    status: "upcoming",
  };
  const [match, setMatch] = useState<Match>(fallbackMatch);
  const [stats, setStats] = useState<RealtimeStats | null>(null);
  const [odds, setOdds] = useState<OddsData | null>(null);
  const [recentForm, setRecentForm] = useState<{
    home: RecentForm;
    away: RecentForm;
  } | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingOdds, setLoadingOdds] = useState(true);
  const [loadingForm, setLoadingForm] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const user = useAuthStore((s) => s.user);
  const session = useAuthStore((s) => s.session);

  const aiPrediction = {
    predictedScore: "2 - 1",
    winProbHome: 58,
    winProbDraw: 22,
    winProbAway: 20,
    stakeSuggestion: "建议投入 3% 资金（示例数据）",
    direction: "主胜 -1 方向（让一球）",
    expectedReturn: "预期收益率约 18%（基于当前赔率与模型边际）",
    riskLevel: "中" as const,
    analysisLines: [
      "模型结合双方进攻效率与射门分布，认为主队胜面更大。",
      "若盘口继续朝主队方向下调，价值空间将逐步收窄。",
      "你可以根据自己的风险偏好适当调整投入比例。",
    ],
    updatedAt: "基于最近一次数据更新",
  };

  useEffect(() => {
    if (!fixtureId || Number.isNaN(fixtureId)) return;

    async function load() {
      try {
        console.log('Loading fixture ID:', fixtureId);
        const res = await fetch(`/api/match/${fixtureId}`);
        const json = await res.json();
        console.log('API response:', json);

        if (json.statistics && Array.isArray(json.statistics.response)) {
          const teams = json.statistics.response;
          if (teams.length >= 2) {
            const homeTeam = translateTeam(teams[0].team.name as string);
            const awayTeam = translateTeam(teams[1].team.name as string);
            setMatch((prev) => ({
              ...prev,
              id: String(fixtureId),
              homeTeam,
              awayTeam,
            }));

            const homeStatsRaw = teams[0].statistics as any[];
            const awayStatsRaw = teams[1].statistics as any[];

            function val(arr: any[], type: string): number {
              const item = arr.find((s) => s.type === type);
              if (!item) return 0;
              const v =
                typeof item.value === "string"
                  ? parseFloat(String(item.value).replace("%", ""))
                  : item.value;
              return Number.isFinite(v) ? v : 0;
            }

            const realStats: RealtimeStats = {
              possessionHome: val(homeStatsRaw, "Ball Possession"),
              possessionAway: val(awayStatsRaw, "Ball Possession"),
              shotsHome: val(homeStatsRaw, "Total Shots"),
              shotsAway: val(awayStatsRaw, "Total Shots"),
              shotsOnTargetHome: val(homeStatsRaw, "Shots on Target"),
              shotsOnTargetAway: val(awayStatsRaw, "Shots on Target"),
              cornersHome: val(homeStatsRaw, "Corner Kicks"),
              cornersAway: val(awayStatsRaw, "Corner Kicks"),
              yellowCardsHome: val(homeStatsRaw, "Yellow Cards"),
              yellowCardsAway: val(awayStatsRaw, "Yellow Cards"),
              dangerousAttacksHome: val(
                homeStatsRaw,
                "Dangerous Attacks"
              ),
              dangerousAttacksAway: val(
                awayStatsRaw,
                "Dangerous Attacks"
              ),
              xGHome: val(homeStatsRaw, "Expected Goals"),
              xGAway: val(awayStatsRaw, "Expected Goals"),
            };
            setStats(realStats);
          }
        } else {
          setStats(fallbackStats);
        }
        setLoadingStats(false);

        if (json.odds && Array.isArray(json.odds.response)) {
          const first = json.odds.response[0];
          const bookmaker = first?.bookmakers?.[0];
          const bets = bookmaker?.bets ?? [];
          const matchWinner = bets.find(
            (b: any) => b.name === "Match Winner"
          );
          const ou = bets.find(
            (b: any) => b.name === "Goals Over/Under"
          );
          const asian = bets.find(
            (b: any) => b.name === "Asian Handicap"
          );

          const openingOdds: OddsData["opening"] = {
            homeWin:
              parseFloat(
                matchWinner?.values?.find((v: any) => v.value === "Home")
                  ?.odd
              ) || fallbackOdds.opening.homeWin,
            draw:
              parseFloat(
                matchWinner?.values?.find((v: any) => v.value === "Draw")
                  ?.odd
              ) || fallbackOdds.opening.draw,
            awayWin:
              parseFloat(
                matchWinner?.values?.find((v: any) => v.value === "Away")
                  ?.odd
              ) || fallbackOdds.opening.awayWin,
            handicap: asian?.values?.[0]?.value ?? fallbackOdds.opening.handicap,
            overUnder: ou?.values?.[0]?.value ?? fallbackOdds.opening.overUnder,
          };

          const liveOdds: OddsData["live"] = {
            ...openingOdds,
          };

          setOdds({
            opening: openingOdds,
            live: liveOdds,
            upsetProbability: fallbackOdds.upsetProbability,
          });
        } else {
          setOdds(fallbackOdds);
        }
        setLoadingOdds(false);

        if (json.recentForm) {
          function mapForm(raw: any): RecentForm {
            const fixtures = raw?.response ?? [];
            return fixtures.map((f: any) => {
              const goalsHome = f.goals.home;
              const goalsAway = f.goals.away;
              const isHome = f.teams.home.id === f.team?.id;
              const gf = isHome ? goalsHome : goalsAway;
              const ga = isHome ? goalsAway : goalsHome;
              if (gf > ga) return "W";
              if (gf < ga) return "L";
              return "D";
            });
          }

          const homeForm =
            json.recentForm.home != null
              ? mapForm(json.recentForm.home)
              : fallbackForm.home;
          const awayForm =
            json.recentForm.away != null
              ? mapForm(json.recentForm.away)
              : fallbackForm.away;
          setRecentForm({ home: homeForm, away: awayForm });
        } else {
          setRecentForm(fallbackForm);
        }
        setLoadingForm(false);
      } catch {
        setStats(fallbackStats);
        setOdds(fallbackOdds);
        setRecentForm(fallbackForm);
        setLoadingStats(false);
        setLoadingOdds(false);
        setLoadingForm(false);
      }
    }

    load();
  }, [fixtureId]);

  async function handleAnalyze() {
    if (!user || !session) {
      setAiError("请先登录后再使用 AI 分析");
      return;
    }
    setAiLoading(true);
    setAiError(null);
    setAiAnalysis(null);

    try {
      const s = stats ?? fallbackStats;
      const o = odds ?? fallbackOdds;
      const f = recentForm ?? fallbackForm;

      const body = {
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        league: match.league,
        homeForm: f.home.join("-"),
        awayForm: f.away.join("-"),
        homeStats: {
          possession: s.possessionHome,
          shots: s.shotsHome,
          shotsOnTarget: s.shotsOnTargetHome,
          xG: s.xGHome,
          corners: s.cornersHome,
        },
        awayStats: {
          possession: s.possessionAway,
          shots: s.shotsAway,
          shotsOnTarget: s.shotsOnTargetAway,
          xG: s.xGAway,
          corners: s.cornersAway,
        },
        odds: {
          homeWin: o.opening.homeWin,
          draw: o.opening.draw,
          awayWin: o.opening.awayWin,
          handicap: o.opening.handicap,
          overUnder: o.opening.overUnder,
        },
      };

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "分析失败");
      setAiAnalysis(json.analysis);
    } catch (e: any) {
      setAiError(e.message ?? "AI 分析失败，请稍后重试");
    } finally {
      setAiLoading(false);
    }
  }

  const statsToShow = stats ?? fallbackStats;
  const oddsToShow = odds ?? fallbackOdds;
  const formToShow = recentForm ?? fallbackForm;

  return (
    <div className="space-y-6">
      {/* 顶部返回 + 比赛基本信息 */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-xs text-white/60 hover:text-white"
      >
        <span className="text-lg">←</span>
        返回热门赛事
      </Link>

      {/* 1. 顶部主队 vs 客队 */}
      <section className="rounded-2xl border border-white/5 bg-[color:var(--card)]/90 p-4 shadow-[0_18px_75px_rgba(0,0,0,0.85)]">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--accent)]/80">
              {translateLeague(match.league)}
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">
              {match.homeTeam}{" "}
              <span className="text-sm text-white/40">vs</span>{" "}
              {match.awayTeam}
            </h1>
            <p className="mt-1 text-xs text-white/60">
              开球时间：{match.kickOff}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-baseline gap-2 text-3xl font-semibold">
              <span>{match.homeScore}</span>
              <span className="text-base text-white/40">:</span>
              <span>{match.awayScore}</span>
            </div>
            <div className="flex flex-col items-end gap-2">
              {match.status === "live" && match.minute && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                  进行中 · {match.minute}&apos;
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1 text-[10px] font-medium text-white/70">
                实时状态 · ScoutAI 模型监控中
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. AI 预测区块 + 付费遮罩 */}
      <section className="grid gap-4 md:grid-cols-[1.4fr,1fr]">
        <div className="space-y-4 rounded-2xl border border-white/5 bg-[color:var(--card)]/90 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight">AI 预测</h2>
            <span className="text-[10px] text-white/50">
              {aiPrediction.updatedAt}
            </span>
          </div>

          <div className="flex items-center gap-6">
            <div>
              <div className="text-[11px] text-white/50">预测比分</div>
              <div className="text-2xl font-semibold text-[color:var(--accent)]">
                {aiPrediction.predictedScore}
              </div>
            </div>
            <div className="flex-1">
              <div className="mb-1 flex justify-between text-[11px] text-white/60">
                <span>胜平负概率</span>
                <span className="font-mono text-[10px] text-white/45">
                  主胜 {aiPrediction.winProbHome}% · 平{" "}
                  {aiPrediction.winProbDraw}% · 客胜{" "}
                  {aiPrediction.winProbAway}%
                </span>
              </div>
              <div className="flex h-3 overflow-hidden rounded-full bg-white/5 text-[10px]">
                <div
                  className="flex items-center justify-center bg-[color:var(--accent)] text-[9px] font-semibold text-black shadow-[0_0_18px_rgba(0,255,135,0.8)]"
                  style={{ width: `${aiPrediction.winProbHome}%` }}
                >
                  主
                </div>
                <div
                  className="flex items-center justify-center bg-slate-500/80 text-[9px] text-white"
                  style={{ width: `${aiPrediction.winProbDraw}%` }}
                >
                  平
                </div>
                <div
                  className="flex items-center justify-center bg-red-500/80 text-[9px] text-white"
                  style={{ width: `${aiPrediction.winProbAway}%` }}
                >
                  客
                </div>
              </div>
            </div>
          </div>

          <PaywalledContent>
            <div className="space-y-3 p-3 text-xs text-white/80">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <div className="text-[11px] text-white/50">建议投入金额</div>
                  <div className="mt-0.5 font-medium">
                    {aiPrediction.stakeSuggestion}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-white/50">推荐方向</div>
                  <div className="mt-0.5 font-medium text-[color:var(--accent)]">
                    {aiPrediction.direction}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-white/50">预期收益 & 风险</div>
                  <div className="mt-0.5 font-medium">
                    {aiPrediction.expectedReturn} · 风险等级：{" "}
                    <span
                      className={
                        aiPrediction.riskLevel === "低"
                          ? "text-emerald-300"
                          : aiPrediction.riskLevel === "中"
                            ? "text-amber-300"
                            : "text-red-300"
                      }
                    >
                      {aiPrediction.riskLevel}
                    </span>
                  </div>
                </div>
              </div>
              <ul className="space-y-1 text-[11px] text-white/70">
                {aiPrediction.analysisLines.map((line, idx) => (
                  <li key={idx}>· {line}</li>
                ))}
              </ul>
            </div>
          </PaywalledContent>
        </div>

        {/* 3. 实时数据左右对比 */}
        <div className="space-y-3 rounded-2xl border border-white/5 bg-[color:var(--card)]/90 p-4">
          <h2 className="text-sm font-semibold tracking-tight">实时数据对比</h2>
          {loadingStats && !stats ? (
            <p className="mt-2 text-[11px] text-white/55">数据加载中...</p>
          ) : stats ? (
            <div className="mt-2 space-y-2">
              <StatRow
                label="控球率"
                home={stats.possessionHome}
                away={stats.possessionAway}
                isPercent
              />
              <StatRow
                label="射门（总数）"
                home={stats.shotsHome}
                away={stats.shotsAway}
              />
              <StatRow
                label="射正"
                home={stats.shotsOnTargetHome}
                away={stats.shotsOnTargetAway}
              />
              <StatRow
                label="角球"
                home={stats.cornersHome}
                away={stats.cornersAway}
              />
              <StatRow
                label="黄牌"
                home={stats.yellowCardsHome}
                away={stats.yellowCardsAway}
              />
              <StatRow
                label="危险进攻"
                home={stats.dangerousAttacksHome}
                away={stats.dangerousAttacksAway}
              />
              <StatRow
                label="预期进球 xG"
                home={stats.xGHome}
                away={stats.xGAway}
              />
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-white/55">数据暂时不可用。</p>
          )}
        </div>
      </section>

      {/* 4. 赔率分析 + 付费爆冷概率 */}
      <section className="grid gap-4 md:grid-cols-[1.2fr,1fr]">
        <div className="space-y-3 rounded-2xl border border-white/5 bg-[color:var(--card)]/90 p-4">
          <h2 className="text-sm font-semibold tracking-tight">赔率分析</h2>
          <p className="text-[11px] text-white/55">
            数据来自 API-Football，可能存在一定延迟。
          </p>

          <div className="mt-2 grid gap-3 text-xs md:grid-cols-2">
            <div className="space-y-2 rounded-xl bg-black/30 p-3">
              <div className="text-[11px] text-white/50">欧赔（开盘 → 即时）</div>
              {[
                {
                  label: "主胜",
                  open: odds?.opening?.homeWin ?? "--",
                  live: odds?.live?.homeWin ?? "--",
                  trend: "down",
                },
                {
                  label: "平局",
                  open: odds?.opening?.draw ?? "--",
                  live: odds?.live?.draw ?? "--",
                  trend: "up",
                },
                {
                  label: "客胜",
                  open: odds?.opening?.awayWin ?? "--",
                  live: odds?.live?.awayWin ?? "--",
                  trend: "up",
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between rounded-lg border border-white/5 bg-black/40 px-2 py-1.5"
                >
                  <span className="text-[11px] text-white/70">{row.label}</span>
                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    <span className="text-white/45">
                      {typeof row.open === "number"
                        ? row.open.toFixed(2)
                        : row.open}
                    </span>
                    <span className="text-white/30">→</span>
                    <span className="text-white">
                      {typeof row.live === "number"
                        ? row.live.toFixed(2)
                        : row.live}
                    </span>
                    <span
                      className={
                        row.trend === "down"
                          ? "text-emerald-400"
                          : "text-red-400"
                      }
                    >
                      {row.trend === "down" ? "↓" : "↑"}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 rounded-xl bg-black/30 p-3">
              <div className="text-[11px] text-white/50">亚盘 / 大小球</div>
              <div className="rounded-lg border border-white/5 bg-black/40 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-white/60">初盘让球</span>
                  <span className="text-xs text-white">
                    {odds?.opening?.handicap ?? "--"}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="text-white/60">即时让球</span>
                  <span className="text-xs text-[color:var(--accent)]">
                    {odds?.live?.handicap ?? "--"}
                  </span>
                </div>
              </div>
              <div className="rounded-lg border border-white/5 bg-black/40 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-white/60">初盘大小球</span>
                  <span className="text-xs text-white">
                    {odds?.opening?.overUnder ?? "--"}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="text-white/60">即时大小球</span>
                  <span className="text-xs text-[color:var(--accent)]">
                    {odds?.live?.overUnder ?? "--"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <PaywalledContent>
          <div className="space-y-2 p-4 text-xs text-white/80">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight">
                爆冷概率评估
              </h2>
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                爆冷概率：{odds?.upsetProbability ?? "--"}%
              </span>
            </div>
            <p className="text-[11px] text-white/70">
              综合欧赔、亚盘、进攻质量与比赛节奏，对潜在爆冷风险进行量化评分。
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 via-amber-300 to-red-500"
                style={{
                  width: `${
                    typeof odds?.upsetProbability === "number"
                      ? odds.upsetProbability
                      : 0
                  }%`,
                }}
              />
            </div>
            <p className="text-[11px] text-white/75">
              当前模型认为，若主队在接下来一段时间内未能扩大比分，爆冷概率可能继续上升。
            </p>
          </div>
        </PaywalledContent>
      </section>

      {/* 5. MiniMax AI 智能分析 */}
      <section className="rounded-2xl border border-[color:var(--accent)]/20 bg-[color:var(--card)]/90 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">🤖 AI 智能分析</h2>
          {!aiAnalysis && !aiLoading && (
            <button
              onClick={handleAnalyze}
              disabled={aiLoading}
              className="rounded-full bg-[color:var(--accent)] px-4 py-1.5 text-xs font-semibold text-black shadow-[0_0_20px_rgba(0,255,135,0.5)] transition hover:bg-emerald-300 disabled:opacity-50"
            >
              开始分析
            </button>
          )}
        </div>

        {!aiAnalysis && !aiLoading && !aiError && (
          <p className="mt-2 text-[11px] text-white/50">
            基于当前赛事数据与您的个人风险偏好，由 MiniMax 大模型生成专属投注建议。
          </p>
        )}

        {aiLoading && (
          <div className="mt-4 flex items-center gap-2 text-[11px] text-white/60">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-[color:var(--accent)]" />
            AI 正在分析中，请稍候...
          </div>
        )}

        {aiError && (
          <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
            {aiError}
          </div>
        )}

        {aiAnalysis && (
          <div className="mt-3 space-y-1">
            <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-white/85">
              {aiAnalysis}
            </pre>
            <button
              onClick={handleAnalyze}
              className="mt-3 text-[10px] text-white/40 underline hover:text-white/60"
            >
              重新分析
            </button>
          </div>
        )}
      </section>

      {/* 6. 近期战绩 */}
      <section className="rounded-2xl border border-white/5 bg-[color:var(--card)]/90 p-4">
        <h2 className="text-sm font-semibold tracking-tight">近期战绩（近 5 场）</h2>
        {loadingForm && !recentForm ? (
          <p className="mt-2 text-[11px] text-white/55">战绩数据加载中...</p>
        ) : recentForm ? (
          <>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div className="space-y-2 rounded-xl bg-black/30 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-white/70">{match.homeTeam}</span>
                  <span className="text-[10px] text-white/45">
                    近期走势
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {recentForm?.home?.map((r, idx) => (
                    <FormBadge key={idx} result={r} />
                  )) ?? []}
                </div>
              </div>
              <div className="space-y-2 rounded-xl bg-black/30 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-white/70">{match.awayTeam}</span>
                  <span className="text-[10px] text-white/45">
                    近期走势
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {recentForm?.away?.map((r, idx) => (
                    <FormBadge key={idx} result={r} />
                  )) ?? []}
                </div>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-white/55">
              以上战绩由 API-Football 提供，具体胜负结果仅供模型参考。
            </p>
          </>
        ) : (
          <p className="mt-2 text-[11px] text-white/55">战绩数据暂时不可用。</p>
        )}
      </section>
    </div>
  );
}

