import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { AuthStatus } from "@/components/AuthStatus";

export const metadata: Metadata = {
  title: "ScoutAI - 足球赛事分析",
  description: "实时足球数据、概率预测、异常提醒和 AI 分析面板",
};

const navItems = [
  { href: "/", label: "热门赛事" },
  { href: "/favorites", label: "收藏" },
  { href: "/alerts", label: "异常提醒" },
  { href: "/settings", label: "设置" },
  { href: "/support", label: "客服" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased bg-background text-foreground">
        <AuthProvider>
          <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
            <header className="sticky top-0 z-30 border-b border-white/5 bg-black/70 backdrop-blur-xl">
              <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6">
                <Link href="/" className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--accent)]/10 ring-1 ring-[color:var(--accent)]/50">
                    <span className="text-sm font-semibold text-[color:var(--accent)]">
                      SA
                    </span>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-semibold tracking-tight">
                        ScoutAI
                      </span>
                      <span className="hidden rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/50 sm:inline">
                        Football Analytics
                      </span>
                    </div>
                    <p className="text-xs text-white/50">
                      实时数据 · 概率预测 · AI 复盘
                    </p>
                  </div>
                </Link>

                <div className="flex items-center gap-3">
                  <nav className="hidden gap-2 text-sm md:flex">
                    {navItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="rounded-full px-3 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/5 hover:text-white"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </nav>
                  <AuthStatus />
                </div>
              </div>
            </header>

            <main className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
              {children}
            </main>

            <footer className="border-t border-white/5 bg-black/40 py-4 text-center text-xs text-white/40">
              ScoutAI © {new Date().getFullYear()} ·{" "}
              <Link href="/support" className="hover:text-[color:var(--accent)]">
                联系客服
              </Link>
            </footer>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
