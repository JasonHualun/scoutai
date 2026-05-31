"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PredictionOrder } from "@/lib/prediction-orders";
import { useAuthStore } from "@/lib/authStore";
import { translateLeague, translateTeam } from "@/lib/league-translations";

type PredictionOrdersResponse = {
  orders?: PredictionOrder[];
  setupRequired?: boolean;
  error?: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function resultLabel(status: string) {
  return {
    pending: "待赛果",
    won: "方向正确",
    lost: "方向未中",
    push: "走平",
    void: "无效",
  }[status] ?? "待赛果";
}

function resultClass(status: string) {
  if (status === "won") return "text-[color:var(--accent)]";
  if (status === "lost") return "text-red-300";
  if (status === "push") return "text-amber-200";
  return "text-white/55";
}

export function HistoryPredictionClient() {
  const user = useAuthStore((state) => state.user);
  const session = useAuthStore((state) => state.session);
  const authLoading = useAuthStore((state) => state.loading);
  const [orders, setOrders] = useState<PredictionOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadOrders() {
      if (!session) {
        setOrders([]);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/prediction-orders", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = (await res.json()) as PredictionOrdersResponse;
        if (cancelled) return;
        setOrders(json.orders ?? []);
        setSetupRequired(!!json.setupRequired);
      } catch {
        if (!cancelled) setOrders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadOrders();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const stats = useMemo(() => {
    const items = orders.flatMap((order) => order.items);
    const settled = items.filter((item) => item.resultStatus !== "pending");
    const wins = settled.filter((item) => item.resultStatus === "won").length;
    const hitRate = settled.length > 0 ? Math.round((wins / settled.length) * 100) : 0;

    return {
      orders: orders.length,
      items: items.length,
      settled: settled.length,
      pending: items.length - settled.length,
      hitRate,
    };
  }, [orders]);

  if (authLoading) {
    return (
      <section className="rounded-2xl border border-white/8 bg-[color:var(--card)]/92 p-5">
        <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
      </section>
    );
  }

  if (!user) {
    return (
      <section className="rounded-2xl border border-[color:var(--accent)]/22 bg-[color:var(--accent)]/7 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">我的历史预测</h2>
            <p className="mt-2 text-sm leading-6 text-white/56">
              登录后，这里会显示你用积分生成过的预测记录。比赛结束后，系统会把推荐方向和真实赛果做比对。
            </p>
          </div>
          <Link
            href="/login"
            className="inline-flex min-h-10 items-center justify-center rounded-full bg-[color:var(--accent)] px-4 text-sm font-bold text-black"
          >
            登录查看
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[color:var(--accent)]/22 bg-[linear-gradient(180deg,rgba(0,255,135,0.08),rgba(20,20,20,0.94))] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.45)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--accent)]">
            我的记录
          </div>
          <h2 className="mt-2 text-xl font-semibold">我的真实预测记录</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/56">
            这里记录你每次用积分生成的预测。系统会保存当时的模型版本、玩法方向、置信度和市场口径；
            后续比赛结束后，再自动更新赛果验证结果。
          </p>
        </div>
        <Link
          href="/predict"
          className="inline-flex min-h-10 items-center justify-center rounded-full border border-[color:var(--accent)]/35 bg-[color:var(--accent)]/12 px-4 text-sm font-bold text-[color:var(--accent)]"
        >
          去预测池
        </Link>
      </div>

      {setupRequired && (
        <div className="mt-4 rounded-xl border border-amber-300/22 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">
          预测记录表还没建好。请先在 Supabase 执行更新后的建表 SQL，之后这里会显示真实记录。
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl bg-black/25 p-3">
          <div className="text-[11px] text-white/45">预测单数</div>
          <div className="mt-1 text-2xl font-bold text-white">{stats.orders}</div>
        </div>
        <div className="rounded-xl bg-black/25 p-3">
          <div className="text-[11px] text-white/45">预测场次</div>
          <div className="mt-1 text-2xl font-bold text-white">{stats.items}</div>
        </div>
        <div className="rounded-xl bg-black/25 p-3">
          <div className="text-[11px] text-white/45">待结算</div>
          <div className="mt-1 text-2xl font-bold text-amber-100">{stats.pending}</div>
        </div>
        <div className="rounded-xl bg-[color:var(--accent)]/10 p-3">
          <div className="text-[11px] text-[color:var(--accent)]/70">已结算准确率</div>
          <div className="mt-1 text-2xl font-bold text-[color:var(--accent)]">
            {stats.settled > 0 ? `${stats.hitRate}%` : "待赛果"}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/55">
          正在读取你的预测记录...
        </div>
      ) : orders.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/55">
          你还没有真实预测记录。去预测池选择比赛并消耗积分生成推荐后，这里会自动保存当时的预测快照。
          下方先展示平台案例，帮助你理解模型指标。
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {orders.slice(0, 6).map((order) => (
            <article key={order.id} className="rounded-2xl border border-white/8 bg-black/22 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-[11px] text-white/42">
                    {formatDate(order.createdAt)} · {order.modelVersion}
                  </div>
                  <h3 className="mt-1 text-base font-semibold text-white">{order.summary}</h3>
                  <p className="mt-1 text-xs text-white/50">
                    扣 {order.cost} 积分 · 预测 {order.predictionCount} 场 · 推荐 {order.selectedCount} 场
                  </p>
                </div>
                <div className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-xs text-white/58">
                  {order.status === "settled" ? "已结算" : "等待赛果"}
                </div>
              </div>

              <div className="mt-3 grid gap-2">
                {order.items.slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-2 rounded-xl bg-black/25 p-3 text-xs md:grid-cols-[1.3fr_0.8fr_0.8fr_0.7fr]"
                  >
                    <div>
                      <div className="font-semibold text-white">
                        {translateTeam(item.homeTeam)} vs {translateTeam(item.awayTeam)}
                      </div>
                      <div className="mt-1 text-white/42">{translateLeague(item.league)}</div>
                    </div>
                    <div>
                      <div className="text-white/42">玩法方向</div>
                      <div className="mt-1 font-semibold text-white">{item.market} · {item.direction}</div>
                    </div>
                    <div>
                      <div className="text-white/42">建议占比</div>
                      <div className="mt-1 font-semibold text-[color:var(--accent)]">
                        {item.recommendation === "selected" ? `${item.suggestedPercent.toFixed(1)}%` : "观察"}
                      </div>
                    </div>
                    <div>
                      <div className="text-white/42">结果</div>
                      <div className={`mt-1 font-semibold ${resultClass(item.resultStatus)}`}>
                        {resultLabel(item.resultStatus)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
