"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CaptchaField } from "@/components/CaptchaField";
import { translateAuthError } from "@/lib/authErrors";
import { signUpWithEmail } from "@/lib/supabase";

type Status = "idle" | "pending";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [captchaRefreshKey, setCaptchaRefreshKey] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    if (!captcha.trim()) {
      setError("请输入验证码");
      return;
    }

    setStatus("pending");
    try {
      await signUpWithEmail(email, password, captcha);
      router.push("/onboarding");
    } catch (err) {
      setError(translateAuthError(err));
      setCaptcha("");
      setCaptchaRefreshKey((current) => current + 1);
      setStatus("idle");
    }
  }

  const isLocked = status === "pending";

  return (
    <div className="flex min-h-[calc(100vh-160px)] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-white/8 bg-[color:var(--card)]/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.75)]">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--accent)]/10 ring-1 ring-[color:var(--accent)]/40">
            <span className="text-sm font-semibold text-[color:var(--accent)]">SA</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">创建 ScoutAI 账号</h1>
          <p className="mt-2 text-xs leading-5 text-white/60">
            填邮箱和密码即可使用，不需要等待验证邮件。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-xs text-white/70">邮箱</span>
            <input
              type="email"
              required
              disabled={isLocked}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none ring-[color:var(--accent)]/40 placeholder:text-white/30 focus:border-[color:var(--accent)]/80 focus:ring-2 disabled:opacity-40"
              placeholder="you@example.com"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-white/70">密码</span>
            <input
              type="password"
              required
              disabled={isLocked}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none ring-[color:var(--accent)]/40 placeholder:text-white/30 focus:border-[color:var(--accent)]/80 focus:ring-2 disabled:opacity-40"
              placeholder="至少 6 位密码"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-white/70">确认密码</span>
            <input
              type="password"
              required
              disabled={isLocked}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none ring-[color:var(--accent)]/40 placeholder:text-white/30 focus:border-[color:var(--accent)]/80 focus:ring-2 disabled:opacity-40"
              placeholder="再次输入密码"
            />
          </label>

          <CaptchaField
            value={captcha}
            onChange={setCaptcha}
            disabled={isLocked}
            refreshKey={captchaRefreshKey}
          />

          {error && (
            <div className="space-y-2">
              <p className="text-xs text-red-400">{error}</p>
              {error.includes("已经注册") && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <Link
                    href="/login"
                    className="rounded-full bg-[color:var(--accent)] px-3 py-1.5 font-semibold text-black hover:bg-emerald-300"
                  >
                    去登录
                  </Link>
                  <Link
                    href="/forgot-password"
                    className="rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-white/65 hover:text-white"
                  >
                    忘记密码
                  </Link>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={isLocked}
            className="flex w-full items-center justify-center rounded-full bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-black shadow-[0_0_40px_rgba(0,255,135,0.75)] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "pending" ? "创建中..." : "创建账号并进入"}
          </button>

          <div className="text-center text-xs text-white/60">
            已有账号？{" "}
            <Link href="/login" className="text-[color:var(--accent)] hover:text-emerald-300">
              去登录
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
