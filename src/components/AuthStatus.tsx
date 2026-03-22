"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, signOut } from "@/lib/supabase";

export function AuthStatus() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      if (!supabase) {
        setLoading(false);
        return;
      }
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setEmail(data.user?.email ?? null);
      setLoading(false);
    }

    loadUser();

    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="h-8 w-20 animate-pulse rounded-full bg-white/5" />
    );
  }

  if (!email) {
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
      <span className="max-w-[140px] truncate rounded-full bg-white/10 px-3 py-1 font-mono text-[11px] text-white/80">
        {email}
      </span>
      <button
        onClick={async () => {
          try {
            await signOut();
            setEmail(null);
            router.push("/login");
          } catch {
            // 忽略登出错误，避免打断交互
          }
        }}
        className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[11px] text-white/70 hover:border-red-400/60 hover:text-red-300"
      >
        登出
      </button>
    </div>
  );
}

