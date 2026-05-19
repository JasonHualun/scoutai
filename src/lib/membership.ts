import type { User } from "@supabase/supabase-js";

export type Plan = "free" | "pro";

export type Membership = {
  plan: Plan;
  status: "free" | "active" | "expired";
  proUntil: string | null;
  email?: string | null;
};

export const PRO_MONTHLY_PRICE_CNY = "¥69.9";
export const PRO_MONTHLY_PRICE_USD = "$9.9";

export function freeMembership(email?: string | null): Membership {
  return {
    plan: "free",
    status: "free",
    proUntil: null,
    email: email ?? null,
  };
}

export function normalizeMembership(
  row: { plan?: string | null; pro_until?: string | null } | null | undefined,
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
  };
}

export function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}
