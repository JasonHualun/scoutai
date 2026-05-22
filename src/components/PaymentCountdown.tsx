"use client";

import { useEffect, useMemo, useState } from "react";

const PROMO_WINDOW_MS = 30 * 60 * 1000;

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return [minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function normalizeUserKey(userKey?: string | null) {
  return userKey?.trim().toLowerCase() || "guest";
}

function readOrCreateDeadline(storageKey: string) {
  const fallback = Date.now() + PROMO_WINDOW_MS;
  try {
    const stored = window.localStorage.getItem(storageKey);
    const parsed = stored == null ? Number.NaN : Number(stored);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    window.localStorage.setItem(storageKey, String(fallback));
  } catch {
    // localStorage is only used to keep the countdown scoped per browser user.
  }
  return fallback;
}

export function PaymentCountdown({
  open,
  userKey,
  className = "",
}: {
  open: boolean;
  userKey?: string | null;
  className?: string;
}) {
  const storageKey = useMemo(
    () => `scoutai:payment-countdown:${normalizeUserKey(userKey)}`,
    [userKey]
  );
  const [deadline] = useState(() =>
    typeof window === "undefined" ? Date.now() + PROMO_WINDOW_MS : readOrCreateDeadline(storageKey)
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  const remaining = Math.max(0, deadline - now);

  return (
    <div
      className={`rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-center shadow-[0_0_28px_rgba(250,204,21,0.12)] ${className}`}
    >
      <div className="text-[11px] font-semibold text-amber-100/80">
        用户专属优惠倒计时
      </div>
      <div className="mt-1 font-mono text-2xl font-semibold tracking-[0.08em] text-amber-200">
        {formatRemaining(remaining)}
      </div>
      <div className="mt-1 text-[11px] leading-4 text-amber-100/55">
        首次打开后开始计时，关闭再打开不会重置
      </div>
    </div>
  );
}
