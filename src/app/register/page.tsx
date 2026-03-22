"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signUpWithEmail, supabase } from "@/lib/supabase";
import { translateAuthError } from "@/lib/authErrors";

type Status = "idle" | "pending" | "success";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  // 倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    setStatus("pending");
    try {
      const data = await signUpWithEmail(email, password);

      if (data.session) {
        // 邮箱验证已关闭，直接有 session
        router.push("/onboarding");
      } else {
        // 需要邮箱验证
        setStatus("success");
        setCountdown(60);
      }
    } catch (err) {
      setError(translateAuthError(err));
      setStatus("idle");
    }
  }

  async function handleResend() {
    setResendMsg(null);
    try {
      await supabase.auth.resend({ type: "signup", email });
      setResendMsg("验证邮件已重新发送，请查收。");
      setCountdown(60);
    } catch (err) {
      setResendMsg(translateAuthError(err));
    }
  }

  const isLocked = status === "success" || status === "pending";

  return (
    <div className="flex min-h-[calc(100vh-120px)] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-white/8 bg-[color:var(--card)]/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.9)]">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--accent)]/10 ring-1 ring-[color:var(--accent)]/40">
            <span className="text-sm font-semibold text-[color:var(--accent)]">
              SA
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">创建 ScoutAI 账号</h1>
          <p className="mt-1 text-xs text-white/60">
            注册后可以保存收藏、订阅异常提醒，并在多设备间同步偏好。
          </p>
        </div>

        {status === "success" ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-300">
              <p className="font-medium">注册成功！</p>
              <p className="mt-1 text-xs text-emerald-300/80">
                我们已向 <span className="font-mono">{email}</span> 发送了验证邮件，请查收并点击链接完成验证。
              </p>
            </div>

            {resendMsg && (
              <p className="text-center text-xs text-emerald-400">{resendMsg}</p>
            )}

            <button
              type="button"
              disabled={countdown > 0}
              onClick={handleResend}
              className="flex w-full items-center justify-center rounded-full border border-white/15 bg-black/30 px-4 py-2 text-sm font-medium text-white/70 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {countdown > 0 ? `重新发送验证邮件（${countdown}s）` : "重新发送验证邮件"}
            </button>

            <p className="text-center text-xs text-white/50">
              验证完成后{" "}
              <Link href="/login" className="text-[color:var(--accent)] hover:text-emerald-300">
                去登录
              </Link>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs text-white/70">邮箱</label>
              <input
                type="email"
                required
                disabled={isLocked}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none ring-[color:var(--accent)]/40 placeholder:text-white/30 focus:border-[color:var(--accent)]/80 focus:ring-2 disabled:opacity-40"
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-white/70">密码</label>
              <input
                type="password"
                required
                disabled={isLocked}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none ring-[color:var(--accent)]/40 placeholder:text-white/30 focus:border-[color:var(--accent)]/80 focus:ring-2 disabled:opacity-40"
                placeholder="至少 6 位密码"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-white/70">确认密码</label>
              <input
                type="password"
                required
                disabled={isLocked}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none ring-[color:var(--accent)]/40 placeholder:text-white/30 focus:border-[color:var(--accent)]/80 focus:ring-2 disabled:opacity-40"
                placeholder="再次输入密码"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={isLocked}
              className="flex w-full items-center justify-center rounded-full bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-black shadow-[0_0_40px_rgba(0,255,135,0.9)] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "pending" ? "注册中..." : "注册并继续"}
            </button>

            <div className="text-center text-xs text-white/60">
              已有账号？{" "}
              <Link href="/login" className="text-[color:var(--accent)] hover:text-emerald-300">
                去登录
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
