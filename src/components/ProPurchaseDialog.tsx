"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  creditPlanById,
  creditPlans,
} from "@/lib/membership";
import type { CreditPlan, CreditPlanId } from "@/lib/membership";
import { PaymentCountdown } from "@/components/PaymentCountdown";

type PaymentApplication = {
  id: string;
  order_no: string;
  email: string;
  amount: number;
  currency: "CNY" | "USD";
  months: number;
  status: "pending" | "confirmed" | "rejected";
  created_at: string;
};

const paymentQrByPlan: Record<CreditPlanId, { wechat: string; alipay: string }> = {
  trial: { wechat: "/payments/wechat.jpg", alipay: "/payments/alipay.jpg" },
  renewal: { wechat: "/payments/wechat.jpg", alipay: "/payments/alipay.jpg" },
  growth: { wechat: "/payments/wechat.jpg", alipay: "/payments/alipay.jpg" },
  pro: { wechat: "/payments/wechat.jpg", alipay: "/payments/alipay.jpg" },
};

function createDraftOrderNo() {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PRO-${date}-${random}`;
}

export function ProPurchaseDialog({
  open,
  onClose,
  email,
  accessToken,
  defaultPlanId = "trial",
  heading = "开通 Pro 预测积分",
  description = "选择套餐后扫码付款，付款完成再提交申请，后台核对到账后开通会员或补充预测积分。",
}: {
  open: boolean;
  onClose: () => void;
  email?: string | null;
  accessToken?: string | null;
  defaultPlanId?: CreditPlanId;
  heading?: string;
  description?: string;
}) {
  const [selectedPlanId, setSelectedPlanId] = useState<CreditPlanId>(defaultPlanId);
  const [orderNo, setOrderNo] = useState("");
  const [application, setApplication] = useState<PaymentApplication | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selectedPlan = creditPlanById(selectedPlanId);
  const selectedQr = paymentQrByPlan[selectedPlan.id];

  useEffect(() => {
    if (!open) return;
    setSelectedPlanId(defaultPlanId);
    setOrderNo(createDraftOrderNo());
    setApplication(null);
    setError(null);
    window.setTimeout(() => {
      panelRef.current?.scrollTo({ top: 0 });
    }, 0);
  }, [defaultPlanId, open]);

  function changePlan(plan: CreditPlan) {
    setSelectedPlanId(plan.id);
    setOrderNo(createDraftOrderNo());
    setApplication(null);
    setError(null);
  }

  async function submitApplication() {
    if (!accessToken) {
      setError("请先登录后再提交付款申请。");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/payment-applications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          orderNo: orderNo || createDraftOrderNo(),
          planId: selectedPlan.id,
          months: 1,
          note: `${selectedPlan.label}：${selectedPlan.priceLabel}，${selectedPlan.credits} 预测积分`,
        }),
      });
      const json = (await res.json()) as {
        application?: PaymentApplication;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "提交付款申请失败");
      if (json.application) setApplication(json.application);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交付款申请失败");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-5">
      <div
        ref={panelRef}
        className="max-h-[calc(100dvh-32px)] w-full max-w-4xl overflow-y-auto rounded-2xl border border-[color:var(--accent)]/25 bg-[#101513] p-4 shadow-[0_25px_90px_rgba(0,0,0,0.85)] sm:p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--accent)]">
              Pro
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">{heading}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/60 hover:text-white"
          >
            关闭
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {creditPlans.map((plan) => {
            const selected = plan.id === selectedPlan.id;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => changePlan(plan)}
                className={`min-h-32 rounded-2xl border p-4 text-left transition ${
                  selected
                    ? "border-[color:var(--accent)] bg-[color:var(--accent)]/12 shadow-[0_0_28px_rgba(0,255,135,0.18)]"
                    : "border-white/10 bg-black/25 hover:border-white/25 hover:bg-white/[0.03]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold text-white">{plan.label}</div>
                  {plan.badge && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] ${
                        selected
                          ? "bg-[color:var(--accent)] text-black"
                          : "bg-white/10 text-white/50"
                      }`}
                    >
                      {plan.badge}
                    </span>
                  )}
                </div>
                <div className="mt-3">
                  {plan.originalPriceLabel && (
                    <div className="text-xs text-white/40 line-through">
                      原价 {plan.originalPriceLabel}
                    </div>
                  )}
                  <div className="text-3xl font-semibold tracking-tight text-white">
                    {plan.priceLabel}
                  </div>
                </div>
                <div className="mt-2 text-xs text-[color:var(--accent)]">
                  {plan.credits} 预测积分 · {plan.estimate}
                </div>
                <p className="mt-3 text-[11px] leading-5 text-white/45">
                  {plan.description}
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-xl border border-white/8 bg-black/25 p-3">
            <PaymentCountdown open={open} userKey={email} />

            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-black/30 px-3 py-2">
                <div className="text-white/45">应付金额</div>
                <div className="mt-1 text-xl font-semibold text-white">
                  {selectedPlan.priceLabel}
                </div>
              </div>
              <div className="rounded-lg bg-[color:var(--accent)]/10 px-3 py-2">
                <div className="text-[color:var(--accent)]/70">到账内容</div>
                <div className="mt-1 font-semibold text-[color:var(--accent)]">
                  {selectedPlan.credits} 积分
                </div>
              </div>
            </div>

            <div className="mt-4 text-[11px] text-white/45">注册邮箱</div>
            <div className="mt-1 break-all text-sm font-semibold text-white">
              {email ?? "请先登录后再提交申请"}
            </div>
            <div className="mt-3 text-[11px] text-white/45">订单编号</div>
            <div className="mt-1 break-all rounded-lg bg-black/35 px-3 py-2 text-xs font-semibold text-[color:var(--accent)]">
              {application?.order_no ?? orderNo}
            </div>
            <div className="mt-3 rounded-lg border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/10 px-3 py-2 text-[11px] leading-5 text-[color:var(--accent)]">
              付款备注请填订单编号。当前先用固定收款码，订单会记录套餐金额和积分；你后台确认后，系统会按套餐自动补对应积分。
            </div>
            <div className="mt-2 rounded-lg border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-[11px] leading-5 text-yellow-100/80">
              真正自动到账需要官方商户接口回调；个人收款码暂时只能人工核对到账。
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/8 bg-black/25 p-3">
              <div className="mb-2 text-xs font-semibold text-white">微信支付</div>
              <Image
                src={selectedQr.wechat}
                alt="微信支付收款码"
                width={414}
                height={586}
                className="mx-auto h-56 w-full rounded-lg bg-white object-contain sm:h-64"
              />
            </div>
            <div className="rounded-xl border border-white/8 bg-black/25 p-3">
              <div className="mb-2 text-xs font-semibold text-white">支付宝</div>
              <Image
                src={selectedQr.alipay}
                alt="支付宝收款码"
                width={640}
                height={960}
                className="mx-auto h-56 w-full rounded-lg bg-white object-contain sm:h-64"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/8 bg-black/25 p-3 text-xs leading-6 text-white/58">
          <div>付款完成后，通常 30 分钟内人工开通或补充积分。</div>
          <div>客服开通时间：每日 09:00 - 18:00。非工作时间付款会顺延处理。</div>
        </div>

        {application ? (
          <div className="mt-4 rounded-xl border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 px-3 py-2 text-xs leading-6 text-[color:var(--accent)]">
            付款申请已提交：{application.order_no}。管理员核对到账后会为 {application.email} 处理 {selectedPlan.label}。
          </div>
        ) : (
          <button
            type="button"
            onClick={submitApplication}
            disabled={submitting || !accessToken}
            className="mt-4 w-full rounded-full bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-black shadow-[0_0_28px_rgba(0,255,135,0.55)] hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "提交中..." : accessToken ? "我已付款，提交开通申请" : "请先登录"}
          </button>
        )}

        {error && (
          <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
