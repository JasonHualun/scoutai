import type { Metadata } from "next";
import Link from "next/link";
import { demoBacktestMatches, runRiskComparison, type RiskBacktestResult } from "@/lib/backtest";

export const metadata: Metadata = {
  title: "模型回测 - ScoutAI",
  description: "ScoutAI 足球预测模型回测与校准面板",
};

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatPoints(value: number) {
  return `${value > 0 ? "+" : ""}${Math.round(value)} 分`;
}

function profitClass(value: number) {
  if (value > 0) return "text-[color:var(--accent)]";
  if (value < 0) return "text-red-300";
  return "text-white";
}

function MetricCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  const toneClass =
    tone === "green"
      ? "border-[color:var(--accent)]/35 bg-[color:var(--accent)]/10"
      : tone === "amber"
        ? "border-amber-300/30 bg-amber-300/8"
        : tone === "red"
          ? "border-red-300/30 bg-red-400/8"
          : "border-white/8 bg-black/25";

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="text-xs text-white/48">{label}</div>
      <div className="mt-2 text-3xl font-black tracking-tight text-white">{value}</div>
      <p className="mt-2 text-xs leading-5 text-white/48">{hint}</p>
    </div>
  );
}

function ProfileCard({ result }: { result: RiskBacktestResult }) {
  const summary = result.summary;
  const isPositive = summary.profit > 0;

  return (
    <article className="rounded-2xl border border-white/8 bg-[color:var(--card)]/92 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--accent)]">
            {result.label}
          </div>
          <h2 className="mt-2 text-xl font-semibold">风险口径回测</h2>
        </div>
        <div
          className={`rounded-full border px-3 py-1 text-xs font-bold ${
            isPositive
              ? "border-[color:var(--accent)]/35 bg-[color:var(--accent)]/10 text-[color:var(--accent)]"
              : "border-red-300/25 bg-red-400/10 text-red-200"
          }`}
        >
          {formatPoints(summary.profit)}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-black/30 p-3">
          <div className="text-white/45">命中率</div>
          <div className="mt-1 text-2xl font-bold">{formatPercent(summary.hitRate)}</div>
        </div>
        <div className="rounded-xl bg-black/30 p-3">
          <div className="text-white/45">ROI</div>
          <div className={`mt-1 text-2xl font-bold ${profitClass(summary.roi)}`}>
            {formatPercent(summary.roi)}
          </div>
        </div>
        <div className="rounded-xl bg-black/30 p-3">
          <div className="text-white/45">模拟入场</div>
          <div className="mt-1 text-2xl font-bold">{summary.betCount}</div>
        </div>
        <div className="rounded-xl bg-black/30 p-3">
          <div className="text-white/45">最大回撤</div>
          <div className="mt-1 text-2xl font-bold text-amber-200">{summary.maxDrawdown}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-xs text-white/55">
        <div className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2">
          <span>Brier 分数</span>
          <strong className="text-white">{summary.brierScore.toFixed(3)}</strong>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2">
          <span>平均价值差</span>
          <strong className="text-white">{formatPercent(summary.averageEdge)}</strong>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2">
          <span>跳过场次</span>
          <strong className="text-white">{summary.passCount}</strong>
        </div>
      </div>
    </article>
  );
}

export default function BacktestPage() {
  const results = runRiskComparison(1000);
  const balanced = results.find((result) => result.riskLevel === "balanced") ?? results[0];
  const best = [...results].sort((left, right) => right.summary.roi - left.summary.roi)[0];
  const totalBets = results.reduce((sum, result) => sum + result.summary.betCount, 0);
  const worstDrawdown = Math.max(...results.map((result) => result.summary.maxDrawdown));
  const bankrolls = balanced.equityCurve.map((point) => point.bankroll);
  const minBankroll = Math.min(...bankrolls);
  const maxBankroll = Math.max(...bankrolls);
  const bankrollRange = Math.max(maxBankroll - minBankroll, 1);

  return (
    <div className="space-y-6">
      <section className="rounded-[1.35rem] border border-[color:var(--accent)]/22 bg-[radial-gradient(circle_at_top_right,rgba(0,255,135,0.14),transparent_34%),linear-gradient(180deg,rgba(20,20,20,0.98),rgba(9,9,9,0.98))] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.55)] md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[color:var(--accent)]">
              Model Backtest
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">模型回测</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
              用历史样本把当前数学模型跑一遍，看它在不同风险偏好下会不会入场、命中率怎样、模拟积分曲线有没有明显回撤。
              当前为内置校准样本，接入真实历史赔率和赛果数据库后会自动替换成正式回测。
            </p>
          </div>
          <Link
            href="/settings"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[color:var(--accent)]/35 bg-[color:var(--accent)]/12 px-5 text-sm font-bold text-[color:var(--accent)] transition hover:bg-[color:var(--accent)]/18"
          >
            调整风险偏好
          </Link>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <MetricCard
            label="样本比赛"
            value={String(demoBacktestMatches.length)}
            hint="五大联赛内置校准样本"
          />
          <MetricCard
            label="模拟入场"
            value={String(totalBets)}
            hint="三种风险偏好合计"
            tone="green"
          />
          <MetricCard
            label="最佳口径"
            value={best.label}
            hint={`当前样本 ROI ${formatPercent(best.summary.roi)}`}
            tone={best.summary.roi >= 0 ? "green" : "amber"}
          />
          <MetricCard
            label="最大回撤"
            value={`${worstDrawdown}`}
            hint="三种口径中最大资金回落"
            tone="amber"
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {results.map((result) => (
          <ProfileCard key={result.riskLevel} result={result} />
        ))}
      </section>

      <section className="rounded-2xl border border-white/8 bg-[color:var(--card)]/92 p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">
              Equity Curve
            </div>
            <h2 className="mt-2 text-xl font-semibold">稳健型模拟积分曲线</h2>
            <p className="mt-2 text-sm leading-6 text-white/55">
              这里不是为了证明一定盈利，而是用来发现模型是否过度激进、有没有连续亏损和回撤失控。
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white/55">
            起始 1000 分 · 结束 {balanced.summary.finalBankroll} 分
          </div>
        </div>

        <div className="mt-5 flex h-28 items-end gap-1 rounded-2xl border border-white/6 bg-black/30 px-4 py-3">
          {balanced.equityCurve.map((point) => {
            const height = 20 + ((point.bankroll - minBankroll) / bankrollRange) * 76;
            return (
              <div
                key={point.index}
                className={`min-w-4 flex-1 rounded-t-md ${
                  point.profit >= 0 ? "bg-[color:var(--accent)]/80" : "bg-red-400/70"
                }`}
                style={{ height: `${height}%` }}
                title={`第 ${point.index} 步：${point.bankroll} 分`}
              />
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-white/8 bg-[color:var(--card)]/92 p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">逐场回测明细</h2>
            <p className="mt-2 text-sm text-white/55">
              当前展示稳健型口径：模型先算胜平负概率，再和赛前欧赔去水概率比较，只有价值差和置信度够才会模拟入场。
            </p>
          </div>
          <div className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-100">
            内置校准样本
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-white/8">
          <div className="grid grid-cols-[1fr_0.8fr_0.8fr_0.6fr] gap-3 bg-black/35 px-4 py-3 text-xs font-semibold text-white/45 md:grid-cols-[0.75fr_1.5fr_0.8fr_0.8fr_0.7fr_0.7fr_0.7fr]">
            <span>日期</span>
            <span>比赛</span>
            <span className="hidden md:block">选择</span>
            <span className="hidden md:block">赔率</span>
            <span>价值差</span>
            <span>积分</span>
            <span>结果</span>
          </div>
          {balanced.picks.map((pick) => (
            <div
              key={pick.matchId}
              className="grid grid-cols-[1fr_0.8fr_0.8fr_0.6fr] gap-3 border-t border-white/6 px-4 py-3 text-xs md:grid-cols-[0.75fr_1.5fr_0.8fr_0.8fr_0.7fr_0.7fr_0.7fr]"
            >
              <span className="text-white/45">{pick.date.slice(5)}</span>
              <span>
                <span className="block font-semibold text-white">{pick.match}</span>
                <span className="mt-1 block text-white/40">{pick.league}</span>
              </span>
              <span className="hidden md:block text-white/75">{pick.pickLabel}</span>
              <span className="hidden md:block text-white/65">{pick.odds ? pick.odds.toFixed(2) : "-"}</span>
              <span className="text-white/75">{pick.edge == null ? "-" : formatPercent(pick.edge)}</span>
              <span className="text-white/75">{pick.stake || "-"}</span>
              <span className={profitClass(pick.profit)}>
                {pick.correct == null ? "跳过" : pick.correct ? `赢 ${formatPoints(pick.profit)}` : `亏 ${Math.abs(pick.profit)} 分`}
              </span>
              <p className="col-span-full text-[11px] leading-5 text-white/42 md:col-start-2">
                {pick.note}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/8 bg-[color:var(--card)]/92 p-5">
          <h2 className="text-lg font-semibold">现在已经测试了什么</h2>
          <div className="mt-4 grid gap-2 text-sm text-white/58">
            <div className="rounded-xl bg-black/25 p-3">胜平负概率是否能和赛果对上，使用 Brier 分数衡量概率质量。</div>
            <div className="rounded-xl bg-black/25 p-3">模型概率和赛前欧赔去水概率之间有没有价值差。</div>
            <div className="rounded-xl bg-black/25 p-3">不同风险偏好会不会改变入场次数、单场积分和最大回撤。</div>
            <div className="rounded-xl bg-black/25 p-3">当前回测只覆盖胜平负，大小球、让球和更多市场会在真实赔率源接入后扩展。</div>
          </div>
        </div>

        <div className="rounded-2xl border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/7 p-5">
          <h2 className="text-lg font-semibold">下一步接真实数据</h2>
          <p className="mt-3 text-sm leading-6 text-white/58">
            真正上线前，需要历史比赛、赛前赔率快照、赛果、球队近况和球员伤停数据。接进来以后，这个页面会变成正式回测面板：
            可以按联赛、月份、市场、风险偏好分别看命中率和模拟收益。
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {["历史赛果", "赛前欧赔", "亚盘让球", "大小球盘口", "xG/射门", "伤停名单"].map((item) => (
              <span
                key={item}
                className="rounded-full border border-[color:var(--accent)]/25 bg-black/24 px-3 py-1.5 text-[color:var(--accent)]"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
