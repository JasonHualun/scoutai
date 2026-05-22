import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "模型回测 - ScoutAI",
  description: "ScoutAI 足球预测模型回测案例与校准面板",
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
    label: "案例样本",
    value: "96",
    hint: "内置展示样本，真实历史库接入后自动替换",
  },
  {
    label: "精选入场",
    value: "31",
    hint: "只保留信号强、赔率合适的比赛",
    tone: "green",
  },
  {
    label: "案例净增",
    value: "+286",
    hint: "起始 1000 分，案例结束 1286 分",
    tone: "green",
  },
  {
    label: "最大回撤",
    value: "72",
    hint: "展示样本中的最大资金回落",
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
    description: "更少入场，只看低波动和优势清晰的方向，适合新用户理解模型价值。",
    tone: "green",
  },
  {
    label: "稳健型",
    headline: "主推展示口径",
    profit: "+286 分",
    hitRate: "71.0%",
    roi: "+28.6%",
    entries: "31",
    drawdown: "72",
    brier: "0.198",
    edge: "21.4%",
    pass: "65",
    description: "兼顾命中率、赔率和回撤，是当前给客户看的默认案例口径。",
    tone: "green",
  },
  {
    label: "进取型",
    headline: "高赔率机会",
    profit: "+418 分",
    hitRate: "64.7%",
    roi: "+41.8%",
    entries: "34",
    drawdown: "138",
    brier: "0.226",
    edge: "24.9%",
    pass: "62",
    description: "会加入更多高赔率机会，收益展示更强，但波动和回撤也会明显变大。",
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
    note: "主队近期状态和主场优势同时满足，适合作为稳健样本。",
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
    note: "降低赔率换稳定性，用于组合里的防守位。",
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
    note: "节奏判断正确但临场转化偏低，作为回撤样本保留。",
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
    note: "强队主场优势明确，盘口水位稳定。",
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
          <div className="text-white/45">案例命中率</div>
          <div className="mt-1 text-2xl font-bold">{profile.hitRate}</div>
        </div>
        <div className="rounded-xl bg-black/30 p-3">
          <div className="text-white/45">案例 ROI</div>
          <div className="mt-1 text-2xl font-bold text-[color:var(--accent)]">{profile.roi}</div>
        </div>
        <div className="rounded-xl bg-black/30 p-3">
          <div className="text-white/45">精选入场</div>
          <div className="mt-1 text-2xl font-bold">{profile.entries}</div>
        </div>
        <div className="rounded-xl bg-black/30 p-3">
          <div className="text-white/45">最大回撤</div>
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
              Model Case Study
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">模型回测</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
              这页现在先做成客户能看懂的精选案例展示：重点看模型如何筛掉低价值比赛、控制回撤，并把优势场次集中展示。
              当前为内置展示样本，不等同于完整真实历史战绩；接入真实历史赔率和赛果数据库后，会自动替换成正式回测。
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

      <section className="grid gap-4 lg:grid-cols-3">
        {profileCases.map((profile) => (
          <ProfileCard key={profile.label} profile={profile} />
        ))}
      </section>

      <section className="rounded-2xl border border-white/8 bg-[color:var(--card)]/92 p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">
              Case Equity Curve
            </div>
            <h2 className="mt-2 text-xl font-semibold">稳健型案例资金曲线</h2>
            <p className="mt-2 text-sm leading-6 text-white/55">
              这条曲线用于展示“筛选后再入场”的效果：不是每场都买，而是让用户看到模型会跳过弱信号，并把推荐集中在优势更明显的场次。
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
            <h2 className="text-xl font-semibold">精选案例明细</h2>
            <p className="mt-2 text-sm text-white/55">
              展示给用户看的重点不是“每场都预测”，而是哪些比赛值得进、哪些应该跳过。正式接入后这里会按真实历史赔率、赛果和用户风险偏好自动计算。
            </p>
          </div>
          <div className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-100">
            内置案例样本
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-white/8">
          <div className="grid grid-cols-[0.7fr_1.35fr_0.85fr_0.7fr] gap-3 bg-black/35 px-4 py-3 text-xs font-semibold text-white/45 md:grid-cols-[0.65fr_1.45fr_0.75fr_0.7fr_0.75fr_0.65fr_0.75fr]">
            <span>日期</span>
            <span>比赛</span>
            <span className="hidden md:block">选择</span>
            <span className="hidden md:block">赔率</span>
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

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/8 bg-[color:var(--card)]/92 p-5">
          <h2 className="text-lg font-semibold">模型和术语说明</h2>
          <p className="mt-2 text-sm leading-6 text-white/55">
            这页用历史样本解释 ScoutAI 怎么筛比赛、怎么避开风险，以及每个指标代表什么。
          </p>
          <div className="mt-4 grid gap-2 text-sm text-white/62">
            <div className="rounded-xl bg-black/25 p-3">
              <span className="font-semibold text-white">模型筛选：</span>
              不是每场都推荐。模型会先看赔率、概率、价值差和风险，信号不够强时会选择跳过。
            </div>
            <div className="rounded-xl bg-black/25 p-3">
              <span className="font-semibold text-white">ROI：</span>
              可以理解为回报率。正数代表这组案例整体有收益，负数代表整体亏损。
            </div>
            <div className="rounded-xl bg-black/25 p-3">
              <span className="font-semibold text-white">最大回撤：</span>
              表示过程中最多曾经亏下去多少，用来观察策略会不会让资金波动太大。
            </div>
            <div className="rounded-xl bg-black/25 p-3">
              <span className="font-semibold text-white">命中率：</span>
              只看猜中多少场还不够，还要结合赔率和 ROI；低赔率命中高，也可能赚得不多。
            </div>
            <div className="rounded-xl bg-black/25 p-3">
              <span className="font-semibold text-white">价值差：</span>
              模型概率和市场赔率之间的差距。差距越明显，才越值得进一步观察。
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/7 p-5">
          <h2 className="text-lg font-semibold">正式回测需要的数据</h2>
          <p className="mt-3 text-sm leading-6 text-white/58">
            真正上线前，需要历史比赛、赛前赔率快照、赛果、球队近况、球员伤停和盘口变化。接入后，这里可以自动显示不同联赛、
            不同月份、不同市场和不同风险偏好的真实表现。
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {["历史赛果", "赛前欧赔", "亚洲让球", "大小球盘口", "xG/射门", "伤停名单"].map((item) => (
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
