"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthStatus } from "@/components/AuthStatus";

const navItems = [
  { href: "/", label: "热门赛事" },
  { href: "/favorites", label: "收藏" },
  { href: "/alerts", label: "异常提醒" },
  { href: "/predict", label: "预测" },
  { href: "/backtest", label: "历史预测" },
  { href: "/settings", label: "设置" },
  { href: "/support", label: "客服" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNav() {
  const pathname = usePathname();
  const homeActive = isActive(pathname, "/");

  return (
    <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6">
      <Link
        href="/"
        className={`flex items-center gap-3 rounded-2xl px-1 py-1 transition ${
          homeActive ? "bg-[color:var(--accent)]/8" : "hover:bg-white/[0.03]"
        }`}
        aria-current={homeActive ? "page" : undefined}
      >
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--accent)]/10 ring-1 ring-[color:var(--accent)]/50 transition ${
            homeActive ? "shadow-[0_0_24px_rgba(0,255,135,0.42)]" : ""
          }`}
        >
          <span className="text-sm font-semibold text-[color:var(--accent)]">SA</span>
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-lg font-semibold tracking-tight transition ${
                homeActive ? "text-[color:var(--accent)]" : "text-white"
              }`}
            >
              ScoutAI
            </span>
            <span className="hidden rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/50 sm:inline">
              Football Analytics
            </span>
          </div>
          <p className="text-xs text-white/50">实时数据 · 概率预测 · AI 复盘</p>
        </div>
      </Link>

      <div className="flex items-center gap-3">
        <nav className="hidden gap-1.5 text-sm md:flex">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "bg-[color:var(--accent)]/14 text-[color:var(--accent)] shadow-[0_0_24px_rgba(0,255,135,0.20)] ring-1 ring-[color:var(--accent)]/35"
                    : "text-white/68 hover:bg-white/5 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <AuthStatus />
      </div>
    </div>
  );
}
