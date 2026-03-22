"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/authStore";
import { OnboardingRedirect } from "./OnboardingRedirect";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    const unsubscribe = init();
    return unsubscribe;
  }, [init]);

  return (
    <>
      <OnboardingRedirect />
      {children}
    </>
  );
}
