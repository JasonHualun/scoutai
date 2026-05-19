"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { translateAuthError } from "@/lib/authErrors";
import { supabase, updatePassword } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setReady(!!data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setReady(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    if (password.length < 6) {
      setError("密码至少需要 6 个字符");
      return;
    }

    setLoading(true);
    try {
      await updatePassword(password);
      setMessage("密码已更新，请使用新密码登录。");
      await supabase.auth.signOut();
      setTimeout(() => router.push("/login"), 900);
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
          <h1 className="text-xl font-semibold tracking-tight">设置新密码</h1>
          <p className="mt-2 text-xs leading-5 text-white/60">
            如果邮件链接打不开，请回到找回密码页面，用订单编号走站内重置。
          </p>
        </div>

        {!ready ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/8 bg-black/25 px-4 py-3 text-xs leading-5 text-white/55">
              链接正在验证中。如果长时间没有出现输入框，通常是链接被邮箱或浏览器拦截。国内用户建议复制完整链接到 Chrome/Edge 打开，或者返回找回密码页面用订单编号重置。
            </div>
            <Link
              href="/forgot-password"
              className="flex w-full items-center justify-center rounded-full border border-white/15 bg-black/30 px-4 py-2 text-sm font-medium text-white/70 hover:text-white"
            >
              用订单编号站内重置
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
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
              {loading ? "保存中..." : "保存新密码"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
