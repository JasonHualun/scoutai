const BEIJING_TIME_ZONE = "Asia/Shanghai";

function validDate(dateStr?: string) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return Number.isNaN(date.getTime()) ? null : date;
}

function beijingDayParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BEIJING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: parts.find((part) => part.type === "year")?.value ?? "0000",
    month: parts.find((part) => part.type === "month")?.value ?? "00",
    day: parts.find((part) => part.type === "day")?.value ?? "00",
  };
}

function dayKey(date: Date) {
  const { year, month, day } = beijingDayParts(date);
  return `${year}-${month}-${day}`;
}

export function formatBeijingClock(dateStr?: string, fallback = "--:--") {
  const date = validDate(dateStr);
  if (!date) return fallback;

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: BEIJING_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatBeijingMatchTime(dateStr?: string, fallback = "--:--") {
  const date = validDate(dateStr);
  if (!date) return fallback;

  const clock = formatBeijingClock(dateStr, fallback);
  const today = dayKey(new Date());
  const tomorrow = dayKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const matchDay = dayKey(date);

  if (matchDay === today) return `今天 ${clock}`;
  if (matchDay === tomorrow) return `明天 ${clock}`;

  const { month, day } = beijingDayParts(date);
  return `${month}/${day} ${clock}`;
}

export function kickoffTime(dateStr?: string) {
  const date = validDate(dateStr);
  return date ? date.getTime() : Number.POSITIVE_INFINITY;
}

export function beijingDateString(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const { year, month, day } = beijingDayParts(date);
  return `${year}-${month}-${day}`;
}
