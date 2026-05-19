"use client";

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

const typeMeta: Record<AlertType, { label: string; tone: string }> = {
  goal: { label: "进球", tone: "text-emerald-300" },
  yellow_card: { label: "黄牌", tone: "text-amber-300" },
  red_card: { label: "红牌", tone: "text-red-300" },
  corner: { label: "角球", tone: "text-sky-300" },
  odds_shift: { label: "赔率异动", tone: "text-cyan-300" },
  upset_warning: { label: "爆冷预警", tone: "text-orange-300" },
  ai_update: { label: "AI 分析更新", tone: "text-[color:var(--accent)]" },
};

const mockAlerts: AlertItem[] = [
  {
    id: "1",
    match_id: "demo-1",
    match_name: "巴黎圣日耳曼 vs 多特蒙德",
    score: "2 : 1",
    type: "upset_warning",
    content: "模型检测到客队进攻质量提升，爆冷概率上升至 18%。",
    created_at: "演示数据",
    read: false,
  },
  {
    id: "2",
    match_id: "demo-2",
    match_name: "曼城 vs 阿森纳",
    score: "0 : 0",
    type: "odds_shift",
    content: "主胜赔率快速下调，市场对主队方向的关注度升高。",
    created_at: "演示数据",
    read: true,
  },
];

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  useEffect(() => {
    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setAlerts(mockAlerts);
          return;
        }

        const { data, error } = await supabase
          .from("alerts")
          .select("id, match_id, match_name, score, type, content, created_at, read")
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

  const unreadCount = alerts.filter((alert) => !alert.read).length;
  const visibleAlerts =
    filter === "unread" ? alerts.filter((alert) => !alert.read) : alerts;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">异常提醒</h1>
          <p className="mt-2 text-sm text-white/60">
            聚合进球、红黄牌、赔率异动和模型预警。
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {[
            ["all", "全部"],
            ["unread", `未读 ${unreadCount}`],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key as "all" | "unread")}
              className={`rounded-full px-3 py-1.5 ${
                filter === key
                  ? "bg-[color:var(--accent)]/15 text-[color:var(--accent)]"
                  : "bg-black/40 text-white/60"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visibleAlerts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-[color:var(--card)]/70 p-6 text-sm text-white/60">
          暂无异常提醒。
        </div>
      ) : (
        <div className="space-y-3">
          {visibleAlerts.map((alert) => {
            const meta = typeMeta[alert.type];
            return (
              <Link
                key={alert.id}
                href={alert.match_id.startsWith("demo") ? "/" : `/match/${alert.match_id}`}
                className={`flex items-start justify-between gap-4 rounded-2xl border bg-[color:var(--card)]/85 p-4 shadow-[0_14px_50px_rgba(0,0,0,0.65)] transition hover:border-[color:var(--accent)]/50 ${
                  alert.read ? "border-white/8" : "border-[color:var(--accent)]/60"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full bg-white/5 px-2 py-0.5 text-[11px] ${meta.tone}`}>
                      {meta.label}
                    </span>
                    {!alert.read && (
                      <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] text-red-300">
                        未读
                      </span>
                    )}
                    <span className="text-[11px] text-white/45">{alert.created_at}</span>
                  </div>
                  <div className="text-sm text-white">
                    {alert.match_name}
                    <span className="ml-2 text-xs text-white/50">{alert.score}</span>
                  </div>
                  <p className="text-xs leading-5 text-white/60">{alert.content}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
