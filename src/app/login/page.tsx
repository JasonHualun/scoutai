"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmail } from "@/lib/supabase";
import { translateAuthError } from "@/lib/authErrors";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
    <div className="flex min-h-[calc(100vh-120px)] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-white/8 bg-[color:var(--card)]/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.9)]">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--accent)]/10 ring-1 ring-[color:var(--accent)]/40">
            <span className="text-sm font-semibold text-[color:var(--accent)]">
              SA
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">登录 ScoutAI</h1>
          <p className="mt-1 text-xs text-white/60">
            使用邮箱登录以同步收藏、提醒与个性化模型参数。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-white/70">邮箱</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none ring-[color:var(--accent)]/40 placeholder:text-white/30 focus:border-[color:var(--accent)]/80 focus:ring-2"
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-white/70">密码</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none ring-[color:var(--accent)]/40 placeholder:text-white/30 focus:border-[color:var(--accent)]/80 focus:ring-2"
              placeholder="至少 6 位密码"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-full bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-black shadow-[0_0_40px_rgba(0,255,135,0.9)] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-white/60">
          还没有账号？{" "}
          <Link
            href="/register"
            className="text-[color:var(--accent)] hover:text-emerald-300"
          >
            去注册
          </Link>
        </div>
      </div>
    </div>
  );
}

