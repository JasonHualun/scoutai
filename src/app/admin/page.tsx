"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuthStore } from "@/lib/authStore";

type AdminApplication = {
  id: string;
  order_no: string;
  email: string;
  amount: number;
  currency: "CNY" | "USD";
  months: number;
  status: "pending" | "confirmed" | "rejected";
  note?: string | null;
  created_at: string;
};

const ADMIN_TOKEN_STORAGE_KEY = "scoutai_admin_token";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function amountLabel(application: AdminApplication) {
  const prefix = application.currency === "USD" ? "$" : "¥";
  return `${prefix}${Number(application.amount).toFixed(1)}`;
}

export default function AdminPage() {
  const user = useAuthStore((state) => state.user);
  const session = useAuthStore((state) => state.session);
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [months, setMonths] = useState(1);
  const [loading, setLoading] = useState(false);
  const [confirmEmailLoading, setConfirmEmailLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [applications, setApplications] = useState<AdminApplication[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rememberToken, setRememberToken] = useState(true);
  const hasAdminCredential = Boolean(session?.access_token || token.trim());

  function adminHeaders(includeJson = false) {
    const headers: Record<string, string> = {};
    if (includeJson) headers["Content-Type"] = "application/json";
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    if (token.trim()) headers["x-admin-token"] = token.trim();
    return headers;
  }

  useEffect(() => {
    const savedToken = window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    if (savedToken) setToken(savedToken);
  }, []);

  useEffect(() => {
    if (!rememberToken) {
      window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
      return;
    }

    if (token.trim()) {
      window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token.trim());
    }
  }, [rememberToken, token]);

  async function loadApplications() {
    setListLoading(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/admin/memberships", {
        headers: adminHeaders(),
      });
      const json = (await res.json()) as {
        applications?: AdminApplication[];
        setupRequired?: boolean;
        error?: string;
      };

      if (!res.ok) throw new Error(json.error ?? "读取付款申请失败");
      setApplications(json.applications ?? []);
      setMessage(
        json.setupRequired
          ? "还需要在 Supabase 执行更新后的 supabase/memberships.sql，执行后这里会显示付款申请。"
          : `已刷新，待确认 ${json.applications?.length ?? 0} 笔`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取付款申请失败");
    } finally {
      setListLoading(false);
    }
  }

  async function confirmApplication(applicationId: string) {
    setConfirmingId(applicationId);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/admin/memberships", {
        method: "POST",
        headers: {
          ...adminHeaders(true),
        },
        body: JSON.stringify({ applicationId, action: "confirm" }),
      });

      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        membership?: { email: string; proUntil: string; predictionCredits?: number };
      };

      if (!res.ok) throw new Error(json.error ?? "确认开通失败");

      setApplications((current) => current.filter((item) => item.id !== applicationId));
      setMessage(
        `${json.membership?.email ?? "用户"} 已开通 Pro，有效期至 ${new Date(
          json.membership?.proUntil ?? ""
        ).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}，预测积分余额 ${
          json.membership?.predictionCredits ?? "待同步"
        }`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "确认开通失败");
    } finally {
      setConfirmingId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/admin/memberships", {
        method: "POST",
        headers: {
          ...adminHeaders(true),
        },
        body: JSON.stringify({ email, months }),
      });

      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        membership?: { email: string; proUntil: string; predictionCredits?: number };
      };

      if (!res.ok) throw new Error(json.error ?? "开通失败");

      setMessage(
        `${json.membership?.email ?? email} 已开通 Pro，有效期至 ${new Date(
          json.membership?.proUntil ?? ""
        ).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}，预测积分余额 ${
          json.membership?.predictionCredits ?? "待同步"
        }`
      );
      setEmail("");
      setMonths(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "开通失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfirmEmailLoading(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/admin/users/confirm-email", {
        method: "POST",
        headers: {
          ...adminHeaders(true),
        },
        body: JSON.stringify({ email: confirmEmail }),
      });

      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        user?: { email: string };
      };

      if (!res.ok) throw new Error(json.error ?? "手动验证邮箱失败");

      setMessage(`${json.user?.email ?? confirmEmail}：${json.message ?? "邮箱已验证"}`);
      setConfirmEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "手动验证邮箱失败");
    } finally {
      setConfirmEmailLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--accent)]/80">
          Admin
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">会员开通后台</h1>
        <p className="mt-2 text-sm leading-6 text-white/60">
          这个页面只给站长操作。你的管理员邮箱登录后可以直接操作；也可以继续使用后台口令。
        </p>
      </div>

      <section className="rounded-2xl border border-white/8 bg-[color:var(--card)]/90 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.6)]">
        <div className="mb-4 grid gap-3 text-xs md:grid-cols-2">
          <div className="rounded-xl border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/8 px-3 py-2">
            <div className="text-[color:var(--accent)]/70">当前登录账号</div>
            <div className="mt-1 break-all font-semibold text-white">
              {user?.email ?? "未登录"}
            </div>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/25 px-3 py-2">
            <div className="text-white/45">管理员方式</div>
            <div className="mt-1 text-white/75">
              {session?.access_token ? "已使用登录账号验证" : "输入后台口令后可操作"}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <label className="grid gap-2 text-xs text-white/60">
            后台口令（可选）
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-[color:var(--accent)]"
              placeholder="已登录管理员邮箱时可以不填"
            />
          </label>
          <button
            type="button"
            onClick={loadApplications}
            disabled={listLoading || !hasAdminCredential}
            className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-black shadow-[0_0_28px_rgba(0,255,135,0.45)] hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {listLoading ? "刷新中..." : "刷新付款申请"}
          </button>
        </div>

        <label className="mt-3 flex items-center gap-2 text-xs text-white/55">
          <input
            type="checkbox"
            checked={rememberToken}
            onChange={(event) => setRememberToken(event.target.checked)}
            className="h-4 w-4 accent-[color:var(--accent)]"
          />
          在这台电脑记住管理员密码
        </label>

        <div className="mt-5 space-y-3">
          {applications.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-black/25 px-4 py-6 text-center text-sm text-white/45">
              暂无待确认申请
            </div>
          ) : (
            applications.map((application) => (
              <div
                key={application.id}
                className="grid gap-3 rounded-xl border border-white/8 bg-black/25 p-4 md:grid-cols-[1fr_auto] md:items-center"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 px-2 py-0.5 text-[11px] font-semibold text-[color:var(--accent)]">
                      {application.order_no}
                    </span>
                    <span className="text-xs text-white/45">
                      {formatDateTime(application.created_at)} 提交
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-white">{application.email}</div>
                  <div className="text-xs text-white/55">
                    {amountLabel(application)} · {application.months} 个月 · 状态：待确认
                  </div>
                  {application.note && (
                    <div className="text-xs text-white/45">备注：{application.note}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => confirmApplication(application.id)}
                  disabled={confirmingId === application.id || !hasAdminCredential}
                  className="rounded-full border border-[color:var(--accent)]/45 bg-[color:var(--accent)]/10 px-4 py-2 text-xs font-semibold text-[color:var(--accent)] hover:bg-[color:var(--accent)] hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {confirmingId === application.id ? "开通中..." : "确认开通 / 补积分"}
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <form
        onSubmit={handleConfirmEmail}
        className="rounded-2xl border border-white/8 bg-[color:var(--card)]/90 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.6)]"
      >
        <h2 className="text-sm font-semibold">邮箱收不到：手动验证账号</h2>
        <p className="mt-2 text-xs leading-5 text-white/50">
          QQ、163 等邮箱偶尔收不到验证邮件。用户注册成功后，你可以在这里输入他的注册邮箱，帮他直接完成邮箱验证。
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <label className="grid gap-2 text-xs text-white/60">
            用户注册邮箱
            <input
              type="email"
              value={confirmEmail}
              onChange={(event) => setConfirmEmail(event.target.value)}
              className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-[color:var(--accent)]"
              placeholder="user@example.com"
              required
            />
          </label>

          <button
            type="submit"
            disabled={confirmEmailLoading || !hasAdminCredential}
            className="rounded-full border border-[color:var(--accent)]/45 bg-[color:var(--accent)]/10 px-4 py-2 text-sm font-semibold text-[color:var(--accent)] hover:bg-[color:var(--accent)] hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {confirmEmailLoading ? "验证中..." : "手动验证邮箱"}
          </button>
        </div>

        <div className="mt-3 rounded-xl border border-white/6 bg-black/25 px-3 py-2 text-xs leading-5 text-white/45">
          这一步只解决“收不到验证邮件”。如果用户已经付款，还需要在付款申请里确认开通 Pro，或在下面直接按邮箱开通。
        </div>
      </form>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-white/8 bg-[color:var(--card)]/90 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.6)]"
      >
        <h2 className="text-sm font-semibold">特殊情况：直接按邮箱开通</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_140px_auto] md:items-end">
          <label className="grid gap-2 text-xs text-white/60">
            用户注册邮箱
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-[color:var(--accent)]"
              placeholder="user@example.com"
              required
            />
          </label>

          <label className="grid gap-2 text-xs text-white/60">
            开通月数
            <input
              type="number"
              min={1}
              max={24}
              value={months}
              onChange={(event) => setMonths(Number(event.target.value || 1))}
              className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-[color:var(--accent)]"
            />
          </label>

          <button
            type="submit"
            disabled={loading || !hasAdminCredential}
            className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-black shadow-[0_0_28px_rgba(0,255,135,0.5)] hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "开通中..." : "开通 Pro"}
          </button>
        </div>

        {message && (
          <div className="mt-4 rounded-xl border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 px-3 py-2 text-xs text-[color:var(--accent)]">
            {message}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
      </form>

      <div className="rounded-2xl border border-white/5 bg-black/25 p-4 text-xs leading-6 text-white/55">
        这套流程不会自动扣款：用户付款后提交订单，你在后台核对到账，再点确认开通。你的管理员邮箱是 491666856@qq.com。
      </div>
    </div>
  );
}
