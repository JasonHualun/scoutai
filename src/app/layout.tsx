import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { AlertNotifier } from "@/components/AlertNotifier";
import { TopNav } from "@/components/TopNav";

export const metadata: Metadata = {
  title: "ScoutAI - 足球赛事分析",
  description: "实时足球数据、概率预测、异常提醒和 AI 分析面板",
};

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
            <AlertNotifier />
            <header className="sticky top-0 z-30 border-b border-white/5 bg-black/70 backdrop-blur-xl">
              <TopNav />
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
