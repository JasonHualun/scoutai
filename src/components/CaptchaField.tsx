"use client";

import Image from "next/image";
import { useState } from "react";

type CaptchaFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  refreshKey?: number;
};

export function CaptchaField({
  value,
  onChange,
  disabled = false,
  refreshKey = 0,
}: CaptchaFieldProps) {
  const [nonce, setNonce] = useState(() => Date.now());

  function refresh() {
    setNonce(Date.now());
    onChange("");
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-white/70">验证码</span>
        <button
          type="button"
          onClick={refresh}
          disabled={disabled}
          className="rounded-full border border-[color:var(--accent)]/35 bg-[color:var(--accent)]/8 px-3 py-1 text-xs font-semibold text-[color:var(--accent)] hover:bg-[color:var(--accent)] hover:text-black disabled:cursor-not-allowed disabled:opacity-45"
        >
          换一张
        </button>
      </div>
      <div className="grid grid-cols-[150px_1fr] gap-3">
        <Image
          src={`/api/auth/captcha?t=${refreshKey}-${nonce}`}
          alt="图形校验码"
          width={150}
          height={58}
          unoptimized
          className="h-[58px] w-[150px] rounded-xl border border-white/10 bg-black/40 object-cover"
        />
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          required
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none ring-[color:var(--accent)]/40 placeholder:text-white/30 focus:border-[color:var(--accent)]/80 focus:ring-2 disabled:opacity-40"
          placeholder="输入验证码"
        />
      </div>
    </div>
  );
}
