import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { AuthStatus } from "@/components/AuthStatus";
import { AuthProvider } from "@/components/AuthProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ScoutAI - 足球赛事分析",
  description: "ScoutAI - 足球赛事数据洞察与异常预警面板",
};

const navItems = [
  { href: "/", label: "热门赛事" },
  { href: "/favorites", label: "收藏" },
  { href: "/alerts", label: "异常提醒" },
  { href: "/settings", label: "设置" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <AuthProvider>
        <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
          <header className="border-b border-white/5 bg-black/40 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--accent)]/10 ring-1 ring-[color:var(--accent)]/40">
                  <span className="text-sm font-semibold text-[color:var(--accent)]">
                    SA
                  </span>
                </div>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold tracking-tight">
                      ScoutAI
                    </span>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/50">
                      Football Analytics
                    </span>
                  </div>
                  <p className="text-xs text-white/50">
                    实时洞察 · 异常预警 · 球探助手
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <nav className="hidden gap-3 text-sm md:flex">
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
            ScoutAI © {new Date().getFullYear()} · Crafted with Next.js
          </footer>
        </div>
        </AuthProvider>
      </body>
    </html>
  );
}
