"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/authStore";
import { supabase } from "@/lib/supabase";

// 不检查 onboarding 的路径
const SKIP_PATHS = ["/onboarding", "/login", "/register"];

export function OnboardingRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuthStore();
  const checked = useRef(false);

  useEffect(() => {
    // auth 还在加载、无用户、当前在跳过路径、已检查过 → 不处理
    if (loading || !user || SKIP_PATHS.some((p) => pathname.startsWith(p))) {
      if (!user) checked.current = false; // 登出后重置，下次登录重新检查
      return;
    }
    if (checked.current) return;

    async function checkPreferences() {
      const { data } = await supabase
        .from("user_preferences")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();

      checked.current = true;
      if (!data) {
        router.push("/onboarding");
      }
    }

    checkPreferences();
  }, [user, loading, pathname, router]);

  return null;
}
