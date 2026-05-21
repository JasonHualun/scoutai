"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ALERTS_UPDATED_EVENT,
  AlertItem,
  alertTypeMeta,
  browserNotificationsEnabled,
  clearBrowserTestAlerts,
  createBrowserTestAlert,
  enableBrowserNotifications,
  formatAlertTime,
  getBrowserNotificationPermission,
  markAlertRead,
  markAllAlertsRead,
  readStoredAlerts,
  sendBrowserNotification,
} from "@/lib/alerts";

type FilterMode = "all" | "unread";
type BrowserPermission = NotificationPermission | "unsupported";

function browserStatusText(permission: BrowserPermission, enabled: boolean) {
  if (permission === "unsupported") return "当前浏览器不支持";
  if (permission === "denied") return "已被浏览器拦截";
  if (permission === "granted" && enabled) return "已开启";
  if (permission === "granted") return "已授权，未开启";
  return "待授权";
}

function browserStatusTone(permission: BrowserPermission, enabled: boolean) {
  if (permission === "granted" && enabled) return "text-[color:var(--accent)]";
  if (permission === "denied") return "text-red-300";
  return "text-amber-300";
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [permission, setPermission] = useState<BrowserPermission>("unsupported");
  const [browserEnabled, setBrowserEnabled] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [testPreview, setTestPreview] = useState<AlertItem | null>(null);

  const refreshAlerts = useCallback(() => {
    setAlerts(readStoredAlerts());
    setPermission(getBrowserNotificationPermission());
    setBrowserEnabled(browserNotificationsEnabled());
  }, []);

  useEffect(() => {
    clearBrowserTestAlerts();
    const timer = window.setTimeout(refreshAlerts, 0);
    window.addEventListener(ALERTS_UPDATED_EVENT, refreshAlerts);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(ALERTS_UPDATED_EVENT, refreshAlerts);
    };
  }, [refreshAlerts]);

  const unreadCount = useMemo(
    () => alerts.filter((alert) => !alert.read).length,
    [alerts]
  );
  const visibleAlerts = useMemo(
    () => (filter === "unread" ? alerts.filter((alert) => !alert.read) : alerts),
    [alerts, filter]
  );

  async function handleEnableBrowserNotifications() {
    if (browserNotificationsEnabled()) {
      refreshAlerts();
      setNotice("Chrome 通知已经开启了，不需要重复开启。");
      return;
    }

    const result = await enableBrowserNotifications();
    refreshAlerts();

    if (result === "granted") {
      setNotice("Chrome 通知已开启。可以点“发送测试通知”确认浏览器弹窗是否正常。");
      return;
    }

    if (result === "denied") {
      setNotice("浏览器拒绝了通知权限，需要在 Chrome 地址栏左侧的网站设置里重新允许。");
      return;
    }

    setNotice("当前浏览器暂不支持网页外通知。");
  }

  function handleTestNotification() {
    const testAlert = createBrowserTestAlert();
    setTestPreview(testAlert);
    const sent = sendBrowserNotification(testAlert);
    setNotice(
      sent
        ? "已发送测试通知。网页内预览也已显示，方便你确认按钮有反应。"
        : "网页内测试预览已显示；如需 Chrome 弹窗，请先开启浏览器通知。"
    );
  }

  function handleMarkAllRead() {
    markAllAlertsRead();
    refreshAlerts();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">异常提醒</h1>
          <p className="mt-2 text-sm text-white/60">
            真实比赛发生比分变化或模型风险变化时，站内提醒和 Chrome 通知会同步触发。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {[
            ["all", "全部"],
            ["unread", `未读 ${unreadCount}`],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key as FilterMode)}
              className={`rounded-full px-3 py-1.5 ${
                filter === key
                  ? "bg-[color:var(--accent)]/15 text-[color:var(--accent)]"
                  : "bg-black/40 text-white/60"
              }`}
            >
              {label}
            </button>
          ))}
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-white/60 hover:text-white"
            >
              全部已读
            </button>
          )}
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-[color:var(--accent)]/20 bg-[color:var(--card)]/85 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--accent)]">
                Notification
              </div>
              <h2 className="mt-2 text-base font-semibold">通知状态</h2>
              <p className="mt-1 text-xs leading-5 text-white/55">
                站内提醒始终开启；Chrome 通知需要用户点一次允许。
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[11px] text-[color:var(--accent)]">
              站内已开启
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-black/25 p-3">
              <div className="text-[11px] text-white/45">网页内提醒</div>
              <div className="mt-1 text-lg font-semibold text-[color:var(--accent)]">
                已开启
              </div>
              <p className="mt-1 text-[11px] leading-5 text-white/45">
                异常发生时，页面右上角会弹出绿色提醒。
              </p>
            </div>
            <div className="rounded-xl bg-black/25 p-3">
              <div className="text-[11px] text-white/45">Chrome 通知</div>
              <div className={`mt-1 text-lg font-semibold ${browserStatusTone(permission, browserEnabled)}`}>
                {browserStatusText(permission, browserEnabled)}
              </div>
              <p className="mt-1 text-[11px] leading-5 text-white/45">
                网站开着或在后台标签页时，也能弹到网页外。
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleEnableBrowserNotifications}
              className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-xs font-semibold text-black shadow-[0_0_28px_rgba(0,255,135,0.45)] hover:bg-emerald-300"
            >
              开启 Chrome 通知
            </button>
            <button
              type="button"
              onClick={handleTestNotification}
              className="rounded-full border border-white/12 bg-black/30 px-4 py-2 text-xs font-semibold text-white/65 hover:text-white"
            >
              发送测试通知
            </button>
          </div>

          {notice && (
            <div className="mt-3 rounded-xl border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/10 px-3 py-2 text-xs leading-5 text-[color:var(--accent)]">
              {notice}
            </div>
          )}

          {testPreview && (
            <div
              role="status"
              className="mt-3 rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-3 text-xs leading-5 text-amber-100"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                  网页内测试预览
                </span>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/55">
                  不计入未读
                </span>
              </div>
              <div className="mt-2 font-semibold text-white">{testPreview.match_name}</div>
              <p className="mt-1 text-white/65">
                {testPreview.content} 如果 Chrome 右下角也弹出通知，说明网页外通知正常。
              </p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/8 bg-[color:var(--card)]/85 p-4">
          <h2 className="text-base font-semibold">当前会触发的真实提醒</h2>
          <div className="mt-3 grid gap-2 text-xs text-white/60">
            <div className="rounded-xl bg-black/25 px-3 py-2">
              1. 实时比赛比分变化：进球后写入站内提醒，并弹出 Chrome 通知。
            </div>
            <div className="rounded-xl bg-black/25 px-3 py-2">
              2. 客队从不领先变成领先：标记为异常预警，提醒重新看风险。
            </div>
            <div className="rounded-xl bg-black/25 px-3 py-2">
              3. 比赛进入实时监控：从未开赛变成进行中时会提醒。
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-white/45">
            红黄牌、角球和盘口异动需要实时数据 API 返回对应字段后接入；现在不会再显示演示提醒。
          </p>
        </div>
      </section>

      {visibleAlerts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-[color:var(--card)]/70 p-6 text-sm leading-6 text-white/60">
          暂无真实异常提醒。打开 Chrome 通知后，网站会每 60 秒检查实时比赛；发生变化时会自动写入这里。
        </div>
      ) : (
        <div className="space-y-3">
          {visibleAlerts.map((alert) => {
            const meta = alertTypeMeta[alert.type];
            const href = alert.match_id.startsWith("test") ? "/alerts" : `/match/${alert.match_id}`;
            return (
              <Link
                key={alert.id}
                href={href}
                onClick={() => {
                  markAlertRead(alert.id);
                  refreshAlerts();
                }}
                className={`flex items-start justify-between gap-4 rounded-2xl border bg-[color:var(--card)]/85 p-4 shadow-[0_14px_50px_rgba(0,0,0,0.65)] transition hover:border-[color:var(--accent)]/50 ${
                  alert.read ? "border-white/8" : "border-[color:var(--accent)]/60"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.bg} ${meta.tone}`}
                    >
                      {meta.label}
                    </span>
                    {!alert.read && (
                      <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] text-red-300">
                        未读
                      </span>
                    )}
                    <span className="text-[11px] text-white/45">
                      {formatAlertTime(alert.created_at)}
                    </span>
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
