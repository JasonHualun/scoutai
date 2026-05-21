"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/authStore";
import {
  Membership,
  PREDICTION_CREDITS_KEY,
  PREDICTION_CREDITS_UPDATED_EVENT,
  freeMembership,
} from "@/lib/membership";
import { signOut } from "@/lib/supabase";
import { ProPurchaseDialog } from "@/components/ProPurchaseDialog";

function readCredits() {
  try {
    const raw = window.localStorage.getItem(PREDICTION_CREDITS_KEY);
    const parsed = raw == null ? Number.NaN : Number(raw);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  } catch {
    return 0;
  }
}

function writeCredits(value: number) {
  const credits = Math.max(0, Math.round(value));
  window.localStorage.setItem(PREDICTION_CREDITS_KEY, String(credits));
  window.dispatchEvent(new Event(PREDICTION_CREDITS_UPDATED_EVENT));
  return credits;
}

export function AuthStatus() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const session = useAuthStore((state) => state.session);
  const loading = useAuthStore((state) => state.loading);
  const [membership, setMembership] = useState<Membership>(() => freeMembership());
  const [credits, setCredits] = useState(0);
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  const isPro = membership.plan === "pro" && membership.status === "active";

  useEffect(() => {
    async function loadMembership() {
      if (!user || !session) {
        setMembership(freeMembership(user?.email));
        return;
      }

      try {
        const res = await fetch("/api/membership", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = (await res.json()) as { membership?: Membership };
        const nextMembership = json.membership ?? freeMembership(user.email);
        setMembership(nextMembership);
        if (typeof nextMembership.predictionCredits === "number") {
          setCredits(writeCredits(nextMembership.predictionCredits));
        }
      } catch {
        setMembership(freeMembership(user.email));
      }
    }

    void loadMembership();
  }, [session, user]);

  useEffect(() => {
    const refresh = () => setCredits(readCredits());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(PREDICTION_CREDITS_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(PREDICTION_CREDITS_UPDATED_EVENT, refresh);
    };
  }, []);

  if (loading) {
    return <div className="h-8 w-20 animate-pulse rounded-full bg-white/5" />;
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded-full border border-[color:var(--accent)]/60 bg-black/40 px-3 py-1.5 text-xs font-medium text-[color:var(--accent)] hover:bg-[color:var(--accent)]/15"
      >
        登录
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 lg:flex">
        <span className={isPro ? "text-[color:var(--accent)]" : "text-white/65"}>
          {isPro ? "Pro" : "免费版"}
        </span>
        <span className="h-3 w-px bg-white/12" />
        <span className="font-mono text-white/80">{credits} 积分</span>
      </div>
      <button
        type="button"
        onClick={() => setPurchaseOpen(true)}
        className="rounded-full bg-[color:var(--accent)] px-3 py-1.5 text-[11px] font-semibold text-black shadow-[0_0_20px_rgba(0,255,135,0.35)] hover:bg-emerald-300"
      >
        {isPro ? "购买积分" : "升级会员"}
      </button>
      <span className="hidden max-w-[150px] truncate rounded-full bg-white/10 px-3 py-1 font-mono text-[11px] text-white/80 sm:inline">
        {user.email}
      </span>
      <button
        onClick={async () => {
          await signOut();
          router.push("/login");
        }}
        className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[11px] text-white/70 hover:border-red-400/60 hover:text-red-300"
      >
        退出
      </button>
      <ProPurchaseDialog
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        email={user.email}
        accessToken={session?.access_token}
        defaultPlanId={isPro ? "renewal" : "trial"}
        heading={isPro ? "购买 Pro 预测积分" : "开通 Pro 预测积分"}
      />
    </div>
  );
}
