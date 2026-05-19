"use client";

import Link from "next/link";
import { useState } from "react";
import { translateAuthError } from "@/lib/authErrors";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [orderNo, setOrderNo] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/reset-password-by-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, orderNo, password }),
      });

      const json = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(json.error ?? "重置密码失败");

      setMessage(json.message ?? "密码已重置，请使用新密码登录");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-160px)] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-white/8 bg-[color:var(--card)]/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.75)]">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--accent)]/10 ring-1 ring-[color:var(--accent)]/40">
            <span className="text-sm font-semibold text-[color:var(--accent)]">SA</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">找回密码</h1>
          <p className="mt-2 text-xs leading-5 text-white/60">
            国内网络优先走站内重置，不再依赖邮件链接。
          </p>
        </div>

        <div className="mb-4 rounded-xl border border-white/8 bg-black/25 px-4 py-3 text-xs leading-5 text-white/55">
          免费账号忘记密码，可以直接重新注册一个新账号。Pro 用户可用付款订单编号重置密码。
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-xs text-white/70">注册邮箱</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none ring-[color:var(--accent)]/40 placeholder:text-white/30 focus:border-[color:var(--accent)]/80 focus:ring-2"
              placeholder="you@example.com"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-white/70">付款订单编号</span>
            <input
              required
              value={orderNo}
              onChange={(event) => setOrderNo(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none ring-[color:var(--accent)]/40 placeholder:text-white/30 focus:border-[color:var(--accent)]/80 focus:ring-2"
              placeholder="PRO-20260519-ABC123"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-white/70">新密码</span>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none ring-[color:var(--accent)]/40 placeholder:text-white/30 focus:border-[color:var(--accent)]/80 focus:ring-2"
              placeholder="至少 6 位密码"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-white/70">确认新密码</span>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none ring-[color:var(--accent)]/40 placeholder:text-white/30 focus:border-[color:var(--accent)]/80 focus:ring-2"
              placeholder="再次输入新密码"
            />
          </label>

          {message && (
            <div className="rounded-xl border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 px-3 py-2 text-xs leading-5 text-[color:var(--accent)]">
              {message}
            </div>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-full bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-black shadow-[0_0_40px_rgba(0,255,135,0.75)] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "重置中..." : "重置 Pro 账号密码"}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-center gap-4 text-xs text-white/60">
          <Link href="/register" className="text-white/45 hover:text-[color:var(--accent)]">
            重新注册
          </Link>
          <Link href="/login" className="text-[color:var(--accent)] hover:text-emerald-300">
            去登录
          </Link>
        </div>
      </div>
    </div>
  );
}
