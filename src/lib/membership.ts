import type { User } from "@supabase/supabase-js";

export type Plan = "free" | "pro";
export type CreditPlanId = "trial" | "renewal" | "growth" | "pro";

export type Membership = {
  plan: Plan;
  status: "free" | "active" | "expired";
  proUntil: string | null;
  email?: string | null;
  predictionCredits?: number;
};

export const PRO_TRIAL_PRICE_CNY = "¥39.9";
export const PRO_RENEWAL_PRICE_CNY = "¥99.9";
export const PRO_ORIGINAL_PRICE_CNY = "¥99.9";
export const PRO_TRIAL_CREDITS = 50;
export const PRO_RENEWAL_CREDITS = 100;
export const PREDICTION_CREDITS_PER_MATCH = 5;
export const PRO_MONTHLY_PRICE_CNY = PRO_TRIAL_PRICE_CNY;
export const PRO_MONTHLY_PRICE_USD = "$9.9";
export const PREDICTION_CREDITS_KEY = "scoutai:prediction-credits";
export const PREDICTION_CREDITS_UPDATED_EVENT = "scoutai:prediction-credits-updated";

export type CreditPlan = {
  id: CreditPlanId;
  label: string;
  price: number;
  priceLabel: string;
  originalPriceLabel?: string;
  credits: number;
  estimate: string;
  badge?: string;
  description: string;
};

export const creditPlans: CreditPlan[] = [
  {
    id: "trial",
    label: "新用户首月",
    price: 39.9,
    priceLabel: "¥39.9",
    originalPriceLabel: "¥99.9/月",
    credits: PRO_TRIAL_CREDITS,
    estimate: "预计预测 10 场比赛结果",
    badge: "首月体验",
    description: "适合先体验 Pro 预测和收藏推荐。",
  },
  {
    id: "renewal",
    label: "标准续费",
    price: 99.9,
    priceLabel: "¥99.9",
    credits: PRO_RENEWAL_CREDITS,
    estimate: "预计预测 20 场比赛结果",
    badge: "常用",
    description: "适合稳定使用的月度补充。",
  },
  {
    id: "growth",
    label: "进阶包",
    price: 299,
    priceLabel: "¥299",
    credits: 500,
    estimate: "预计预测 100 场比赛结果",
    badge: "更划算",
    description: "适合收藏比赛多、经常做组合筛选的用户。",
  },
  {
    id: "pro",
    label: "专业包",
    price: 699,
    priceLabel: "¥699",
    credits: 1000,
    estimate: "预计预测 200 场比赛结果",
    badge: "高频",
    description: "适合长期高频分析和多联赛监控。",
  },
];

export function creditPlanById(id?: string | null) {
  return creditPlans.find((plan) => plan.id === id) ?? creditPlans[0];
}

export function creditPlanByAmount(amount?: number | string | null) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return null;
  return (
    creditPlans.find((plan) => Math.abs(plan.price - numericAmount) < 0.05) ?? null
  );
}

export function freeMembership(email?: string | null): Membership {
  return {
    plan: "free",
    status: "free",
    proUntil: null,
    email: email ?? null,
    predictionCredits: 0,
  };
}

export function normalizeMembership(
  row:
    | { plan?: string | null; pro_until?: string | null; prediction_credits?: number | null }
    | null
    | undefined,
  user?: User | null
): Membership {
  const proUntil = row?.pro_until ?? null;
  const active = !!proUntil && new Date(proUntil).getTime() > Date.now();
  const plan = row?.plan === "pro" && active ? "pro" : "free";

  return {
    plan,
    status: plan === "pro" ? "active" : proUntil ? "expired" : "free",
    proUntil,
    email: user?.email ?? null,
    predictionCredits: Math.max(0, Math.round(Number(row?.prediction_credits ?? 0))),
  };
}

export function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}
