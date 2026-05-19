"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAuthStore } from "@/lib/authStore";
import {
  SUPPORT_HOURS,
  SUPPORT_QQ,
  SUPPORT_QQ_LINK,
  SUPPORT_RESPONSE,
  supportMessage,
} from "@/lib/support";

export default function SupportPage() {
  const { user, loading } = useAuthStore();
  const [copied, setCopied] = useState<"qq" | "message" | null>(null);
  const email = user?.email ?? undefined;
  const message = useMemo(() => supportMessage(email), [email]);

  async function copyText(text: string, type: "qq" | "message") {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    window.setTimeout(() => setCopied(null), 1800);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--accent)]/80">
          Support
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">联系客服</h1>
        <p className="mt-2 text-sm leading-6 text-white/60">
          客服主要处理付款后未开通、订单核对和会员状态异常。注册可以直接完成，忘记密码请在登录页自助处理。
        </p>
      </div>

      <section className="rounded-2xl border border-white/8 bg-[color:var(--card)]/90 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.6)]">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="text-xs text-white/45">客服 QQ</div>
            <a
              href={SUPPORT_QQ_LINK}
              className="mt-1 inline-flex font-mono text-2xl font-semibold text-[color:var(--accent)] hover:text-emerald-300"
            >
              {SUPPORT_QQ}
            </a>
            <p className="mt-2 text-xs leading-5 text-white/55">
              付款后未开通时，发送注册邮箱、订单编号和付款时间，客服会核对并处理。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={SUPPORT_QQ_LINK}
                className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-xs font-semibold text-black shadow-[0_0_24px_rgba(0,255,135,0.45)] hover:bg-emerald-300"
              >
                打开 QQ 联系客服
              </a>
              <button
                type="button"
                onClick={() => copyText(SUPPORT_QQ, "qq")}
                className="rounded-full border border-white/15 bg-black/30 px-4 py-2 text-xs font-semibold text-white/70 hover:text-white"
              >
                {copied === "qq" ? "已复制 QQ" : "复制 QQ"}
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 px-4 py-3 text-xs leading-6 text-[color:var(--accent)]">
            <div>服务时间：每日 {SUPPORT_HOURS}</div>
            <div>处理速度：{SUPPORT_RESPONSE}</div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/8 bg-black/25 p-5">
        <h2 className="text-sm font-semibold">什么情况需要联系客服</h2>
        <div className="mt-3 space-y-3 text-xs leading-6 text-white/58">
          <div className="rounded-xl bg-black/25 px-3 py-2">
            1. 已付款并提交申请，超过 30 分钟仍未开通。
          </div>
          <div className="rounded-xl bg-black/25 px-3 py-2">
            2. 付款时没有填写订单编号，需要人工核对付款时间。
          </div>
          <div className="rounded-xl bg-black/25 px-3 py-2">
            3. 账号能登录，但会员状态没有刷新。
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/8 bg-black/35 p-3">
          <div className="text-[11px] text-white/45">可直接发送给客服</div>
          <div className="mt-2 rounded-lg bg-black/35 px-3 py-2 text-xs leading-5 text-white/80">
            {message}
          </div>
          <button
            type="button"
            onClick={() => copyText(message, "message")}
            className="mt-3 rounded-full border border-white/15 bg-black/30 px-4 py-2 text-xs font-semibold text-white/70 hover:text-white"
          >
            {copied === "message" ? "已复制话术" : "复制这句话"}
          </button>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        {loading ? (
          <div className="h-9 w-32 animate-pulse rounded-full bg-white/5" />
        ) : user ? (
          <>
            <Link
              href="/"
              className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-xs font-semibold text-black shadow-[0_0_24px_rgba(0,255,135,0.45)] hover:bg-emerald-300"
            >
              返回热门赛事
            </Link>
            <Link
              href="/settings"
              className="rounded-full border border-white/15 bg-black/30 px-4 py-2 text-xs font-semibold text-white/70 hover:text-white"
            >
              查看账号设置
            </Link>
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-xs font-semibold text-black shadow-[0_0_24px_rgba(0,255,135,0.45)] hover:bg-emerald-300"
            >
              登录账号
            </Link>
            <Link
              href="/forgot-password"
              className="rounded-full border border-white/15 bg-black/30 px-4 py-2 text-xs font-semibold text-white/70 hover:text-white"
            >
              找回密码
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
