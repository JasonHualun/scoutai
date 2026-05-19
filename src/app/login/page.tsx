"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { translateAuthError } from "@/lib/authErrors";
import { signInWithEmail } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signInWithEmail(email, password);
      router.push("/");
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
          <h1 className="text-xl font-semibold tracking-tight">登录 ScoutAI</h1>
          <p className="mt-2 text-xs leading-5 text-white/60">
            登录后可同步收藏、关注联赛、模拟积分偏好和 AI 分析参数。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-xs text-white/70">邮箱</span>
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
            <span className="text-xs text-white/70">密码</span>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none ring-[color:var(--accent)]/40 placeholder:text-white/30 focus:border-[color:var(--accent)]/80 focus:ring-2"
              placeholder="至少 6 位密码"
            />
          </label>

          <div className="flex items-center justify-between text-xs">
            <span />
            <Link href="/forgot-password" className="text-white/45 hover:text-[color:var(--accent)]">
              忘记密码？
            </Link>
          </div>

          {error && (
            <div className="space-y-2">
              <p className="text-xs text-red-400">{error}</p>
              {error.includes("邮箱或密码错误") && (
                <div className="rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-xs leading-5 text-white/55">
                  免费账号忘记密码，可以去注册页用同一个邮箱重新设置密码；Pro 账号请用订单编号找回密码。
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link
                      href="/register"
                      className="rounded-full bg-[color:var(--accent)] px-3 py-1.5 font-semibold text-black hover:bg-emerald-300"
                    >
                      重新设置免费账号密码
                    </Link>
                    <Link
                      href="/forgot-password"
                      className="rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-white/65 hover:text-white"
                    >
                      Pro 找回密码
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-full bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-black shadow-[0_0_40px_rgba(0,255,135,0.75)] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-white/60">
          还没有账号？{" "}
          <Link href="/register" className="text-[color:var(--accent)] hover:text-emerald-300">
            去注册
          </Link>
        </div>
      </div>
    </div>
  );
}
