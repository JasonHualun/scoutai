'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type AlertType =
  | "goal"
  | "yellow_card"
  | "red_card"
  | "corner"
  | "odds_shift"
  | "upset_warning"
  | "ai_update";

type AlertItem = {
  id: string;
  match_id: string;
  match_name: string;
  score: string;
  type: AlertType;
  content: string;
  created_at: string;
  read: boolean;
};

const typeMeta: Record<
  AlertType,
  { icon: string; label: string; tone: string }
> = {
  goal: { icon: "⚽", label: "进球", tone: "text-emerald-300" },
  yellow_card: { icon: "🟡", label: "黄牌", tone: "text-amber-300" },
  red_card: { icon: "🔴", label: "红牌", tone: "text-red-300" },
  corner: { icon: "🚩", label: "角球", tone: "text-sky-300" },
  odds_shift: { icon: "📈", label: "赔率异动", tone: "text-cyan-300" },
  upset_warning: { icon: "🔥", label: "爆冷预警", tone: "text-orange-300" },
  ai_update: { icon: "💡", label: "AI 分析更新", tone: "text-[color:var(--accent)]" },
};

const mockAlerts: AlertItem[] = [
  {
    id: "1",
    match_id: "ucl-psg-bvb",
    match_name: "巴黎圣日耳曼 vs 多特蒙德",
    score: "2 : 1",
    type: "upset_warning",
    content: "模型检测到多特进攻质量提升，爆冷概率上升至 18%。",
    created_at: "2026-03-10 63'",
    read: false,
  },
  {
    id: "2",
    match_id: "ucl-psg-bvb",
    match_name: "巴黎圣日耳曼 vs 多特蒙德",
    score: "1 : 1",
    type: "odds_shift",
    content: "主胜赔率从 1.65 降至 1.48，市场看多情绪增强。",
    created_at: "2026-03-10 48'",
    read: true,
  },
  {
    id: "3",
    match_id: "ucl-psg-bvb",
    match_name: "巴黎圣日耳曼 vs 多特蒙德",
    score: "1 : 0",
    type: "goal",
    content: "巴黎禁区内连续传递后破门，xG 累积至 1.2。",
    created_at: "2026-03-10 32'",
    read: true,
  },
];

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  useEffect(() => {
    async function load() {
      try {
        if (!supabase) {
          setAlerts(mockAlerts);
          return;
        }
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setAlerts([]);
          return;
        }
        const { data, error } = await supabase
          .from("alerts")
          .select(
            "id, match_id, match_name, score, type, content, created_at, read"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        if (error) {
          setAlerts(mockAlerts);
        } else {
          setAlerts((data as AlertItem[]) ?? []);
        }
      } catch {
        setAlerts(mockAlerts);
      }
    }
    load();
  }, []);

  const unreadCount = alerts.filter((a) => !a.read).length;
  const visibleAlerts =
    filter === "unread" ? alerts.filter((a) => !a.read) : alerts;
  const isEmpty = visibleAlerts.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">异常提醒</h1>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-full px-3 py-1 ${
              filter === "all"
                ? "bg-[color:var(--accent)]/15 text-[color:var(--accent)]"
                : "bg-black/40 text-white/60"
            }`}
          >
            全部
          </button>
          <button
            type="button"
            onClick={() => setFilter("unread")}
            className={`relative rounded-full px-3 py-1 ${
              filter === "unread"
                ? "bg-[color:var(--accent)]/15 text-[color:var(--accent)]"
                : "bg-black/40 text-white/60"
            }`}
          >
            未读
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-[9px] text-white">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {isEmpty ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-[color:var(--card)]/70 p-6 text-sm text-white/60">
          <div className="text-base">
            <span className="mr-1">🔔</span>暂无异常提醒。
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleAlerts.map((alert) => {
            const meta = typeMeta[alert.type];
            return (
              <Link
                key={alert.id}
                href={`/match/${alert.match_id}`}
                className={`flex items-start justify-between gap-4 rounded-2xl border bg-[color:var(--card)]/85 p-4 shadow-[0_14px_50px_rgba(0,0,0,0.8)] transition hover:border-[color:var(--accent)]/50 ${
                  alert.read ? "border-white/8" : "border-[color:var(--accent)]/60"
                }`}
              >
                <div className="flex flex-1 items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-lg ${meta.tone}`}
                  >
                    {meta.icon}
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] ${meta.tone} bg-white/5`}
                      >
                        {meta.label}
                      </span>
                      {!alert.read && (
                        <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] text-red-300">
                          未读
                        </span>
                      )}
                      <span className="text-[11px] text-[#888888] font-light">
                        {alert.created_at}
                      </span>
                    </div>
                    <div className="text-sm text-white">
                      {alert.match_name}{" "}
                      <span className="ml-1 text-xs text-white/50">
                        {alert.score}
                      </span>
                    </div>
                    <p className="text-xs font-light text-[#888888]">
                      {alert.content}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

