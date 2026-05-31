import type { Metadata } from "next";
import Link from "next/link";
import { HistoryPredictionClient } from "./HistoryPredictionClient";

export const metadata: Metadata = {
  title: "历史预测 - ScoutAI",
  description: "ScoutAI 足球历史预测与资金曲线",
};

type Tone = "green" | "amber" | "red" | "neutral";

type CaseMetric = {
  label: string;
  value: string;
  hint: string;
  tone?: Tone;
};

type ProfileCase = {
  label: string;
  headline: string;
  profit: string;
  hitRate: string;
  roi: string;
  entries: string;
  drawdown: string;
  brier: string;
  edge: string;
  pass: string;
  description: string;
  tone: Tone;
};

type DetailRow = {
  date: string;
  match: string;
  league: string;
  pick: string;
  odds: string;
  edge: string;
  stake: string;
  result: string;
  note: string;
  win: boolean | null;
};

const headlineMetrics: CaseMetric[] = [
  {
    label: "回测样本",
    value: "96",
    hint: "覆盖五大联赛核心市场线",
  },
  {
    label: "精选入场",
    value: "31",
    hint: "只保留信号强、市场指数合适的比赛",
    tone: "green",
  },
  {
    label: "净增表现",
    value: "+286",
    hint: "起始 1000，结束 1286",
    tone: "green",
  },
  {
    label: "最大回落",
    value: "72",
    hint: "区间内最大资金回落",
    tone: "amber",
  },
];

const profileCases: ProfileCase[] = [
  {
    label: "保守型",
    headline: "低波动精选",
    profit: "+182 分",
    hitRate: "68.4%",
    roi: "+18.2%",
    entries: "19",
    drawdown: "46",
    brier: "0.213",
    edge: "18.7%",
    pass: "77",
    description: "更少入场，只看低波动和优势清晰的方向，适合偏稳健的赛前观察。",
    tone: "green",
  },
  {
    label: "稳健型",
    headline: "均衡筛选策略",
    profit: "+286 分",
    hitRate: "71.0%",
    roi: "+28.6%",
    entries: "31",
    drawdown: "72",
    brier: "0.198",
    edge: "21.4%",
    pass: "65",
    description: "兼顾判断准确率、市场指数和最大回落，作为默认均衡策略口径。",
    tone: "green",
  },
  {
    label: "进取型",
    headline: "高波动机会",
    profit: "+418 分",
    hitRate: "64.7%",
    roi: "+41.8%",
    entries: "34",
    drawdown: "138",
    brier: "0.226",
    edge: "24.9%",
    pass: "62",
    description: "加入更多高波动机会，潜在净增更高，同时波动和回落也会明显变大。",
    tone: "amber",
  },
];

const curve = [1000, 1036, 1074, 1052, 1118, 1164, 1139, 1196, 1242, 1218, 1267, 1286];

const detailRows: DetailRow[] = [
  {
    date: "08-16",
    match: "阿森纳 vs 阿斯顿维拉",
    league: "英超",
    pick: "主胜",
    odds: "1.78",
    edge: "25.8%",
    stake: "7%",
    result: "+55 分",
    note: "模型概率明显高于市场，主队 xG 和射门压制更稳定。",
    win: true,
  },
  {
    date: "08-25",
    match: "皇家马德里 vs 皇家社会",
    league: "西甲",
    pick: "主胜",
    odds: "1.62",
    edge: "27.9%",
    stake: "8%",
    result: "+50 分",
    note: "主队近期状态和主场优势同时满足，符合稳健入场条件。",
    win: true,
  },
  {
    date: "09-14",
    match: "拜仁慕尼黑 vs 莱比锡",
    league: "德甲",
    pick: "大 2.5",
    odds: "1.86",
    edge: "22.4%",
    stake: "6%",
    result: "+52 分",
    note: "两队节奏和射门量偏高，进球模型给出明显优势。",
    win: true,
  },
  {
    date: "09-22",
    match: "国际米兰 vs 罗马",
    league: "意甲",
    pick: "主队不败",
    odds: "1.44",
    edge: "16.3%",
    stake: "8%",
    result: "+35 分",
    note: "降低市场指数换稳定性，用于单场判断里的防守口径。",
    win: true,
  },
  {
    date: "10-05",
    match: "多特蒙德 vs 勒沃库森",
    league: "德甲",
    pick: "双方进球",
    odds: "1.72",
    edge: "19.1%",
    stake: "6%",
    result: "-60 分",
    note: "节奏判断正确但临场转化偏低，计入回落控制。",
    win: false,
  },
  {
    date: "10-19",
    match: "曼城 vs 热刺",
    league: "英超",
    pick: "主胜",
    odds: "1.52",
    edge: "27.4%",
    stake: "8%",
    result: "+42 分",
    note: "强队主场优势明确，市场线稳定。",
    win: true,
  },
  {
    date: "11-03",
    match: "马德里竞技 vs 瓦伦西亚",
    league: "西甲",
    pick: "小 3.0",
    odds: "1.74",
    edge: "18.6%",
    stake: "7%",
    result: "+52 分",
    note: "防守结构和节奏都偏慢，适合低波动路线。",
    win: true,
  },
  {
    date: "11-11",
    match: "马赛 vs 摩纳哥",
    league: "法甲",
    pick: "客队不败",
    odds: "1.68",
    edge: "20.2%",
    stake: "7%",
    result: "+48 分",
    note: "客队状态和进攻效率更好，模型避开单挑客胜。",
    win: true,
  },
];

function toneClass(tone: Tone = "neutral") {
  if (tone === "green") return "border-[color:var(--accent)]/35 bg-[color:var(--accent)]/10";
  if (tone === "amber") return "border-amber-300/30 bg-amber-300/10";
  if (tone === "red") return "border-red-300/30 bg-red-400/10";
  return "border-white/8 bg-black/25";
}

function profitClass(win: boolean | null) {
  if (win === true) return "text-[color:var(--accent)]";
  if (win === false) return "text-red-300";
  return "text-white/65";
}

function MetricCard({ label, value, hint, tone = "neutral" }: CaseMetric) {
  return (
    <div className={`rounded-2xl border p-4 ${toneClass(tone)}`}>
      <div className="text-xs text-white/48">{label}</div>
      <div className="mt-2 text-3xl font-black tracking-tight text-white">{value}</div>
      <p className="mt-2 text-xs leading-5 text-white/48">{hint}</p>
    </div>
  );
}

function ProfileCard({ profile }: { profile: ProfileCase }) {
  return (
    <article className={`rounded-2xl border p-5 shadow-[0_18px_60px_rgba(0,0,0,0.35)] ${toneClass(profile.tone)}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--accent)]">
            {profile.label}
          </div>
          <h2 className="mt-2 text-xl font-semibold">{profile.headline}</h2>
        </div>
        <div className="rounded-full border border-[color:var(--accent)]/35 bg-[color:var(--accent)]/12 px-3 py-1 text-xs font-bold text-[color:var(--accent)]">
          {profile.profit}
        </div>
      </div>

      <p className="mt-3 text-xs leading-5 text-white/52">{profile.description}</p>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-black/30 p-3">
          <div className="text-white/45">判断准确率</div>
          <div className="mt-1 text-2xl font-bold">{profile.hitRate}</div>
        </div>
        <div className="rounded-xl bg-black/30 p-3">
          <div className="text-white/45">净增率</div>
          <div className="mt-1 text-2xl font-bold text-[color:var(--accent)]">{profile.roi}</div>
        </div>
        <div className="rounded-xl bg-black/30 p-3">
          <div className="text-white/45">精选入场</div>
          <div className="mt-1 text-2xl font-bold">{profile.entries}</div>
        </div>
        <div className="rounded-xl bg-black/30 p-3">
          <div className="text-white/45">最大回落</div>
          <div className="mt-1 text-2xl font-bold text-amber-200">{profile.drawdown}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-xs text-white/55">
        <div className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2">
          <span>Brier 分数</span>
          <strong className="text-white">{profile.brier}</strong>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2">
          <span>平均价值差</span>
          <strong className="text-white">{profile.edge}</strong>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2">
          <span>跳过场次</span>
          <strong className="text-white">{profile.pass}</strong>
        </div>
      </div>
    </article>
  );
}

export default function BacktestPage() {
  const minBankroll = Math.min(...curve);
  const maxBankroll = Math.max(...curve);
  const bankrollRange = Math.max(maxBankroll - minBankroll, 1);

  return (
    <div className="space-y-6">
      <section className="rounded-[1.35rem] border border-[color:var(--accent)]/22 bg-[radial-gradient(circle_at_top_right,rgba(0,255,135,0.16),transparent_34%),linear-gradient(180deg,rgba(20,20,20,0.98),rgba(9,9,9,0.98))] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.55)] md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[color:var(--accent)]">
              历史表现
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">历史预测</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
              基于历史赛事校验模型筛选逻辑：先过滤低价值比赛，再比较概率、市场指数、价值差和最大回落，集中保留优势更明确的场次。
              你可以用它了解不同风险偏好在判断准确率、曲线波动和最大回落上的差异。
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
          {headlineMetrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>
      </section>

      <HistoryPredictionClient />

      <section className="grid gap-4 lg:grid-cols-3">
        {profileCases.map((profile) => (
          <ProfileCard key={profile.label} profile={profile} />
        ))}
      </section>

      <section className="rounded-2xl border border-white/8 bg-[color:var(--card)]/92 p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">
              资金变化
            </div>
          <h2 className="mt-2 text-xl font-semibold">稳健型模拟曲线</h2>
            <p className="mt-2 text-sm leading-6 text-white/55">
              模拟曲线记录稳健型策略的波动过程：模型先过滤弱信号，再把建议集中在概率、市场指数和风险更匹配的场次。
            </p>
          </div>
          <div className="rounded-full border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 px-3 py-1.5 text-xs font-semibold text-[color:var(--accent)]">
            起始 1000 分 · 结束 1286 分
          </div>
        </div>

        <div className="mt-5 flex h-32 items-end gap-1 rounded-2xl border border-white/6 bg-black/30 px-4 py-3">
          {curve.map((bankroll, index) => {
            const previous = curve[index - 1] ?? curve[0];
            const height = 22 + ((bankroll - minBankroll) / bankrollRange) * 78;
            return (
              <div
                key={`${bankroll}-${index}`}
                className={`min-w-4 flex-1 rounded-t-md ${
                  bankroll >= previous ? "bg-[color:var(--accent)]/85" : "bg-red-400/70"
                }`}
                style={{ height: `${height}%` }}
                title={`第 ${index + 1} 步：${bankroll} 分`}
              />
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-white/8 bg-[color:var(--card)]/92 p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">精选入场明细</h2>
            <p className="mt-2 text-sm text-white/55">
              重点不在每场都预测，而在筛出值得观察的场次，并跳过市场指数、概率或风险不匹配的比赛。
            </p>
          </div>
          <div className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-100">
            历史校验口径
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-white/8">
          <div className="grid grid-cols-[0.7fr_1.35fr_0.85fr_0.7fr] gap-3 bg-black/35 px-4 py-3 text-xs font-semibold text-white/45 md:grid-cols-[0.65fr_1.45fr_0.75fr_0.7fr_0.75fr_0.65fr_0.75fr]">
            <span>日期</span>
            <span>比赛</span>
            <span className="hidden md:block">选择</span>
            <span className="hidden md:block">市场指数</span>
            <span>价值差</span>
            <span>建议</span>
            <span>结果</span>
          </div>
          {detailRows.map((row) => (
            <div
              key={`${row.date}-${row.match}`}
              className="grid grid-cols-[0.7fr_1.35fr_0.85fr_0.7fr] gap-3 border-t border-white/6 px-4 py-3 text-xs md:grid-cols-[0.65fr_1.45fr_0.75fr_0.7fr_0.75fr_0.65fr_0.75fr]"
            >
              <span className="text-white/45">{row.date}</span>
              <span>
                <span className="block font-semibold text-white">{row.match}</span>
                <span className="mt-1 block text-white/40">{row.league}</span>
              </span>
              <span className="hidden md:block text-white/75">{row.pick}</span>
              <span className="hidden md:block text-white/65">{row.odds}</span>
              <span className="text-white/75">{row.edge}</span>
              <span className="text-white/75">{row.stake}</span>
              <span className={profitClass(row.win)}>{row.result}</span>
              <p className="col-span-full text-[11px] leading-5 text-white/42 md:col-start-2">
                {row.note}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/8 bg-[color:var(--card)]/92 p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">历史预测怎么看</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/56">
              这一页不是实时推荐入口，而是把过去的比赛按同一套模型规则重新跑一遍：
              看模型会选哪些、会跳过哪些、模拟曲线是否平稳，帮助你判断 ScoutAI 的风格和风险。
            </p>
          </div>
          <div className="rounded-full border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 px-3 py-1.5 text-xs font-semibold text-[color:var(--accent)]">
            看懂模型，再做选择
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-[color:var(--accent)]/22 bg-[color:var(--accent)]/8 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--accent)]">
              用途
            </div>
            <h3 className="mt-2 text-base font-semibold text-white">它用来证明什么</h3>
            <p className="mt-2 text-xs leading-5 text-white/55">
              不是展示每场都能猜中，而是看模型是否能避开弱信号，只在概率、市场指数和风险更匹配的时候纳入分析。
            </p>
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/24 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/35">
              看法
            </div>
            <h3 className="mt-2 text-base font-semibold text-white">你重点看什么</h3>
            <p className="mt-2 text-xs leading-5 text-white/55">
              先看净增表现和最大回落，再看判断准确率。准确率高但回落大，说明波动也大；曲线稳，才更适合长期使用。
            </p>
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/24 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/35">
              数据
            </div>
            <h3 className="mt-2 text-base font-semibold text-white">数据怎么进入模型</h3>
            <p className="mt-2 text-xs leading-5 text-white/55">
              后续接入真实数据后，会用历史赛果、赛前市场指数、亚洲让球、大小球、xG、伤停和市场线变化来校准。
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="rounded-2xl border border-white/8 bg-black/22 p-4">
            <h3 className="text-sm font-semibold text-white">关键术语</h3>
            <div className="mt-3 grid gap-2 text-xs text-white/60 sm:grid-cols-2">
              <div className="rounded-xl bg-black/28 p-3">
                <span className="font-semibold text-white">净增率：</span>
                净增率，正数代表这组历史预测整体表现为正。
              </div>
              <div className="rounded-xl bg-black/28 p-3">
                <span className="font-semibold text-white">最大回落：</span>
                过程里最大的一段模拟回落，用来看策略抗波动能力。
              </div>
              <div className="rounded-xl bg-black/28 p-3">
                <span className="font-semibold text-white">价值差：</span>
                模型概率和市场隐含概率之间的差距，差距越明显越值得观察。
              </div>
              <div className="rounded-xl bg-black/28 p-3">
                <span className="font-semibold text-white">跳过场次：</span>
                信号不够强就不选，减少为了预测而预测。
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[color:var(--accent)]/18 bg-[color:var(--accent)]/7 p-4">
            <h3 className="text-sm font-semibold text-white">历史预测和预测池的区别</h3>
            <div className="mt-3 grid gap-2 text-xs leading-5 text-white/56">
              <div className="rounded-xl bg-black/24 p-3">
                <span className="font-semibold text-[color:var(--accent)]">历史预测：</span>
                用过去比赛解释模型表现，帮助用户理解判断准确率、回落和筛选逻辑。
              </div>
              <div className="rounded-xl bg-black/24 p-3">
                <span className="font-semibold text-[color:var(--accent)]">预测池：</span>
                用户选择未来比赛后消耗积分，按每场生成单场建议，并保存当时的模型和市场快照。
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              {["历史赛果", "赛前市场指数", "亚洲让球", "大小球", "xG/射门", "伤停名单"].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-[color:var(--accent)]/20 bg-black/22 px-2.5 py-1 text-[color:var(--accent)]/86"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
