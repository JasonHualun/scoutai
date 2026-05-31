export type AlertType =
  | "goal"
  | "yellow_card"
  | "red_card"
  | "corner"
  | "odds_shift"
  | "upset_warning"
  | "ai_update";

export type AlertItem = {
  id: string;
  match_id: string;
  match_name: string;
  score: string;
  type: AlertType;
  content: string;
  created_at: string;
  read: boolean;
  source: "live" | "browser_test" | "server";
};

export type LiveAlertMatch = {
  id: number | string;
  league?: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: "live" | "upcoming" | "finished";
  minute?: number;
  yellowCardsHome?: number;
  yellowCardsAway?: number;
  redCardsHome?: number;
  redCardsAway?: number;
  cornersHome?: number;
  cornersAway?: number;
  homeWinOdds?: number;
  drawOdds?: number;
  awayWinOdds?: number;
  upsetProbability?: number;
  upsetSide?: string;
};

export type AlertTypeMeta = {
  label: string;
  tone: string;
  bg: string;
};

type MatchSnapshot = {
  id: string;
  match_name: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: "live" | "upcoming" | "finished";
  minute?: number;
  yellowCardsHome?: number;
  yellowCardsAway?: number;
  redCardsHome?: number;
  redCardsAway?: number;
  cornersHome?: number;
  cornersAway?: number;
  homeWinOdds?: number;
  drawOdds?: number;
  awayWinOdds?: number;
  upsetProbability?: number;
  upsetSide?: string;
};

export type AlertSnapshot = Record<string, MatchSnapshot>;

export const ALERTS_STORAGE_KEY = "scoutai:alerts";
export const ALERT_SNAPSHOT_STORAGE_KEY = "scoutai:live-alert-snapshot";
export const BROWSER_NOTIFICATIONS_KEY = "scoutai:browser-notifications-enabled";
export const ALERTS_UPDATED_EVENT = "scoutai:alerts-updated";

export const alertTypeMeta: Record<AlertType, AlertTypeMeta> = {
  goal: { label: "进球", tone: "text-emerald-300", bg: "bg-emerald-500/10" },
  yellow_card: { label: "黄牌", tone: "text-amber-300", bg: "bg-amber-500/10" },
  red_card: { label: "红牌", tone: "text-red-300", bg: "bg-red-500/10" },
  corner: { label: "角球", tone: "text-sky-300", bg: "bg-sky-500/10" },
  odds_shift: { label: "市场指数异动", tone: "text-cyan-300", bg: "bg-cyan-500/10" },
  upset_warning: { label: "异常预警", tone: "text-orange-300", bg: "bg-orange-500/10" },
  ai_update: {
    label: "模型更新",
    tone: "text-[color:var(--accent)]",
    bg: "bg-[color:var(--accent)]/10",
  },
};

function isBrowser() {
  return typeof window !== "undefined";
}

function nowIso() {
  return new Date().toISOString();
}

function alertTimeLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function safeNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function optionalNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function createAlertId(matchId: string, type: AlertType, score: string) {
  return `${type}-${matchId}-${score.replace(/\s+/g, "")}-${Date.now()}`;
}

function isAlertType(value: unknown): value is AlertType {
  return (
    value === "goal" ||
    value === "yellow_card" ||
    value === "red_card" ||
    value === "corner" ||
    value === "odds_shift" ||
    value === "upset_warning" ||
    value === "ai_update"
  );
}

function normalizeStoredAlert(value: unknown): AlertItem | null {
  if (!value || typeof value !== "object") return null;
  const alert = value as Partial<AlertItem>;

  if (
    typeof alert.id !== "string" ||
    typeof alert.match_id !== "string" ||
    typeof alert.match_name !== "string" ||
    typeof alert.score !== "string" ||
    typeof alert.content !== "string" ||
    typeof alert.created_at !== "string" ||
    !isAlertType(alert.type)
  ) {
    return null;
  }

  return {
    id: alert.id,
    match_id: alert.match_id,
    match_name: alert.match_name,
    score: alert.score,
    type: alert.type,
    content: alert.content,
    created_at: alert.created_at,
    read: Boolean(alert.read),
    source: alert.source === "server" || alert.source === "browser_test" ? alert.source : "live",
  };
}

export function formatAlertTime(iso: string) {
  return alertTimeLabel(iso);
}

export function readStoredAlerts() {
  if (!isBrowser()) return [];

  try {
    const raw = window.localStorage.getItem(ALERTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeStoredAlert)
      .filter((alert): alert is AlertItem => Boolean(alert))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch {
    return [];
  }
}

export function saveStoredAlerts(alerts: AlertItem[]) {
  if (!isBrowser()) return;
  const trimmed = alerts
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 80);

  window.localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(trimmed));
  window.dispatchEvent(new Event(ALERTS_UPDATED_EVENT));
}

export function appendStoredAlerts(alerts: AlertItem[]) {
  if (!alerts.length) return [];

  const existing = readStoredAlerts();
  const seen = new Set(existing.map((alert) => alert.id));
  const fresh = alerts.filter((alert) => !seen.has(alert.id));
  if (!fresh.length) return [];

  saveStoredAlerts([...fresh, ...existing]);
  return fresh;
}

export function markAlertRead(id: string) {
  saveStoredAlerts(
    readStoredAlerts().map((alert) => (alert.id === id ? { ...alert, read: true } : alert))
  );
}

export function markAllAlertsRead() {
  saveStoredAlerts(readStoredAlerts().map((alert) => ({ ...alert, read: true })));
}

export function clearBrowserTestAlerts() {
  saveStoredAlerts(readStoredAlerts().filter((alert) => alert.source !== "browser_test"));
}

export function removeStoredAlertsForMatchIds(matchIds: Iterable<string | number>) {
  const ids = new Set([...matchIds].map(String));
  if (ids.size === 0) return;

  const currentAlerts = readStoredAlerts();
  const nextAlerts = currentAlerts.filter((alert) => !ids.has(alert.match_id));
  if (nextAlerts.length !== currentAlerts.length) {
    saveStoredAlerts(nextAlerts);
  }

  const snapshot = readSnapshot();
  if (!snapshot) return;
  ids.forEach((id) => {
    delete snapshot[id];
  });
  saveSnapshot(snapshot);
}

export function readSnapshot(): AlertSnapshot | null {
  if (!isBrowser()) return null;

  try {
    const raw = window.localStorage.getItem(ALERT_SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as AlertSnapshot;
  } catch {
    return null;
  }
}

export function saveSnapshot(snapshot: AlertSnapshot) {
  if (!isBrowser()) return;
  window.localStorage.setItem(ALERT_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
}

export function snapshotFromMatches(matches: LiveAlertMatch[]): AlertSnapshot {
  return matches.reduce<AlertSnapshot>((snapshot, match) => {
    const id = String(match.id);
    snapshot[id] = {
      id,
      match_name: `${match.homeTeam} vs ${match.awayTeam}`,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeScore: safeNumber(match.homeScore),
      awayScore: safeNumber(match.awayScore),
      status: match.status,
      minute: match.minute,
      yellowCardsHome: optionalNumber(match.yellowCardsHome),
      yellowCardsAway: optionalNumber(match.yellowCardsAway),
      redCardsHome: optionalNumber(match.redCardsHome),
      redCardsAway: optionalNumber(match.redCardsAway),
      cornersHome: optionalNumber(match.cornersHome),
      cornersAway: optionalNumber(match.cornersAway),
      homeWinOdds: optionalNumber(match.homeWinOdds),
      drawOdds: optionalNumber(match.drawOdds),
      awayWinOdds: optionalNumber(match.awayWinOdds),
      upsetProbability: optionalNumber(match.upsetProbability),
      upsetSide: match.upsetSide,
    };
    return snapshot;
  }, {});
}

function hasNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function pushIncrementAlert({
  alerts,
  match,
  oldValue,
  newValue,
  type,
  teamName,
  label,
  score,
  createdAt,
}: {
  alerts: AlertItem[];
  match: MatchSnapshot;
  oldValue?: number;
  newValue?: number;
  type: AlertType;
  teamName: string;
  label: string;
  score: string;
  createdAt: string;
}) {
  if (!hasNumber(oldValue) || !hasNumber(newValue)) return;
  const delta = newValue - oldValue;
  if (delta <= 0) return;

  alerts.push({
    id: createAlertId(match.id, type, `${score}-${label}-${teamName}`),
    match_id: match.id,
    match_name: match.match_name,
    score,
    type,
    content: `${teamName} 新增 ${delta} 次${label}，当前${label}数 ${newValue}。`,
    created_at: createdAt,
    read: false,
    source: "live",
  });
}

function pushOddsAlert({
  alerts,
  match,
  oldOdd,
  newOdd,
  label,
  score,
  createdAt,
}: {
  alerts: AlertItem[];
  match: MatchSnapshot;
  oldOdd?: number;
  newOdd?: number;
  label: string;
  score: string;
  createdAt: string;
}) {
  if (!hasNumber(oldOdd) || !hasNumber(newOdd) || oldOdd <= 1 || newOdd <= 1) return;

  const diff = newOdd - oldOdd;
  const pct = Math.abs(diff / oldOdd) * 100;
  if (pct < 8 && Math.abs(diff) < 0.15) return;

  const direction = diff < 0 ? "被压低" : "被抬高";
  alerts.push({
    id: createAlertId(match.id, "odds_shift", `${score}-${label}`),
    match_id: match.id,
    match_name: match.match_name,
    score,
    type: "odds_shift",
    content: `${label}市场指数从 ${oldOdd.toFixed(2)} 变到 ${newOdd.toFixed(2)}，${direction} ${pct.toFixed(1)}%，市场关注度发生变化。`,
    created_at: createdAt,
    read: false,
    source: "live",
  });
}

export function buildLiveAlerts(previous: AlertSnapshot, current: AlertSnapshot) {
  const alerts: AlertItem[] = [];

  Object.values(current).forEach((match) => {
    const old = previous[match.id];

    const score = `${match.homeScore} : ${match.awayScore}`;
    const createdAt = nowIso();

    if ((!old || old.status !== "live") && match.status === "live") {
      alerts.push({
        id: createAlertId(match.id, "ai_update", score),
        match_id: match.id,
        match_name: match.match_name,
        score,
        type: "ai_update",
        content: "收藏比赛已进入实时监控，比赛进球、牌、角球和市场线变化会自动提醒。",
        created_at: createdAt,
        read: false,
        source: "live",
      });
    }

    if (!old) return;

    if (match.homeScore > old.homeScore) {
      alerts.push({
        id: createAlertId(match.id, "goal", score),
        match_id: match.id,
        match_name: match.match_name,
        score,
        type: "goal",
        content: `${match.homeTeam} 出现进球，比分更新为 ${score}。`,
        created_at: createdAt,
        read: false,
        source: "live",
      });
    }

    if (match.awayScore > old.awayScore) {
      alerts.push({
        id: createAlertId(match.id, "goal", score),
        match_id: match.id,
        match_name: match.match_name,
        score,
        type: "goal",
        content: `${match.awayTeam} 出现进球，比分更新为 ${score}。`,
        created_at: createdAt,
        read: false,
        source: "live",
      });
    }

    pushIncrementAlert({
      alerts,
      match,
      oldValue: old.yellowCardsHome,
      newValue: match.yellowCardsHome,
      type: "yellow_card",
      teamName: match.homeTeam,
      label: "黄牌",
      score,
      createdAt,
    });
    pushIncrementAlert({
      alerts,
      match,
      oldValue: old.yellowCardsAway,
      newValue: match.yellowCardsAway,
      type: "yellow_card",
      teamName: match.awayTeam,
      label: "黄牌",
      score,
      createdAt,
    });
    pushIncrementAlert({
      alerts,
      match,
      oldValue: old.redCardsHome,
      newValue: match.redCardsHome,
      type: "red_card",
      teamName: match.homeTeam,
      label: "红牌",
      score,
      createdAt,
    });
    pushIncrementAlert({
      alerts,
      match,
      oldValue: old.redCardsAway,
      newValue: match.redCardsAway,
      type: "red_card",
      teamName: match.awayTeam,
      label: "红牌",
      score,
      createdAt,
    });
    pushIncrementAlert({
      alerts,
      match,
      oldValue: old.cornersHome,
      newValue: match.cornersHome,
      type: "corner",
      teamName: match.homeTeam,
      label: "角球",
      score,
      createdAt,
    });
    pushIncrementAlert({
      alerts,
      match,
      oldValue: old.cornersAway,
      newValue: match.cornersAway,
      type: "corner",
      teamName: match.awayTeam,
      label: "角球",
      score,
      createdAt,
    });

    pushOddsAlert({
      alerts,
      match,
      oldOdd: old.homeWinOdds,
      newOdd: match.homeWinOdds,
      label: "主胜",
      score,
      createdAt,
    });
    pushOddsAlert({
      alerts,
      match,
      oldOdd: old.drawOdds,
      newOdd: match.drawOdds,
      label: "平局",
      score,
      createdAt,
    });
    pushOddsAlert({
      alerts,
      match,
      oldOdd: old.awayWinOdds,
      newOdd: match.awayWinOdds,
      label: "客胜",
      score,
      createdAt,
    });

    const wasAwayLeading = old.awayScore > old.homeScore;
    const isAwayLeading = match.awayScore > match.homeScore;
    if (!wasAwayLeading && isAwayLeading) {
      alerts.push({
        id: createAlertId(match.id, "upset_warning", score),
        match_id: match.id,
        match_name: match.match_name,
        score,
        type: "upset_warning",
        content: "客队比分领先，赛前模型需要重新校准，请重点关注风险变化。",
        created_at: createdAt,
        read: false,
        source: "live",
      });
    }

    if (hasNumber(old.upsetProbability) && hasNumber(match.upsetProbability)) {
      const delta = match.upsetProbability - old.upsetProbability;
      const crossedRiskLine = old.upsetProbability < 55 && match.upsetProbability >= 55;
      if (delta >= 8 || crossedRiskLine) {
        alerts.push({
          id: createAlertId(match.id, "upset_warning", `${score}-upset`),
          match_id: match.id,
          match_name: match.match_name,
          score,
          type: "upset_warning",
          content: `${match.upsetSide ?? "冷门方向"}概率从 ${old.upsetProbability.toFixed(1)}% 升到 ${match.upsetProbability.toFixed(1)}%，建议重新检查收藏赛事风险。`,
          created_at: createdAt,
          read: false,
          source: "live",
        });
      }
    }
  });

  return alerts;
}

export function browserNotificationsSupported() {
  return isBrowser() && "Notification" in window;
}

export function browserNotificationsEnabled() {
  if (!browserNotificationsSupported()) return false;
  return (
    window.Notification.permission === "granted" &&
    window.localStorage.getItem(BROWSER_NOTIFICATIONS_KEY) === "true"
  );
}

export function getBrowserNotificationPermission(): NotificationPermission | "unsupported" {
  if (!browserNotificationsSupported()) return "unsupported";
  return window.Notification.permission;
}

export async function enableBrowserNotifications() {
  if (!browserNotificationsSupported()) return "unsupported";

  const permission =
    window.Notification.permission === "default"
      ? await window.Notification.requestPermission()
      : window.Notification.permission;

  if (permission === "granted") {
    window.localStorage.setItem(BROWSER_NOTIFICATIONS_KEY, "true");
  }

  return permission;
}

export function disableBrowserNotifications() {
  if (!isBrowser()) return;
  window.localStorage.setItem(BROWSER_NOTIFICATIONS_KEY, "false");
}

export function sendBrowserNotification(alert: AlertItem) {
  if (!browserNotificationsEnabled()) return false;

  const meta = alertTypeMeta[alert.type];
  try {
    const notification = new window.Notification(`ScoutAI ${meta.label}`, {
      body: `${alert.match_name} ${alert.score}\n${alert.content}`,
      tag: alert.id,
    });

    notification.onclick = () => {
      window.focus();
      if (!alert.match_id.startsWith("test")) {
        window.location.href = `/match/${alert.match_id}`;
      }
    };

    return true;
  } catch {
    return false;
  }
}

export function createBrowserTestAlert(): AlertItem {
  return {
    id: `test-${Date.now()}`,
    match_id: "test-notification",
    match_name: "ScoutAI 通知测试",
    score: "浏览器通知",
    type: "ai_update",
    content: "如果你看到这条 Chrome 通知，说明网页外通知已经开启。",
    created_at: nowIso(),
    read: false,
    source: "browser_test",
  };
}
