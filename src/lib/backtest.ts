import {
  calculateFootballPrediction,
  MatchAnalysisData,
  RiskLevel,
  UserPreferences,
} from "@/lib/football-prediction";

export type BacktestOutcome = "homeWin" | "draw" | "awayWin";

export type BacktestMatch = MatchAnalysisData & {
  id: string;
  date: string;
  leagueId: number;
  result: {
    home: number;
    away: number;
  };
};

export type BacktestPick = {
  matchId: string;
  date: string;
  league: string;
  match: string;
  pick: BacktestOutcome | "pass";
  pickLabel: string;
  actual: BacktestOutcome;
  actualLabel: string;
  odds: number | null;
  modelProbability: number;
  marketProbability: number | null;
  edge: number | null;
  stake: number;
  profit: number;
  correct: boolean | null;
  confidence: number;
  note: string;
};

export type BacktestSummary = {
  sampleLabel: string;
  totalMatches: number;
  betCount: number;
  passCount: number;
  hitRate: number;
  brierScore: number;
  totalStake: number;
  profit: number;
  roi: number;
  maxDrawdown: number;
  finalBankroll: number;
  averageEdge: number;
  averageConfidence: number;
};

export type BacktestBreakdown = {
  label: string;
  bets: number;
  hitRate: number;
  profit: number;
  roi: number;
};

export type RiskBacktestResult = {
  riskLevel: RiskLevel;
  label: string;
  summary: BacktestSummary;
  picks: BacktestPick[];
  leagueBreakdown: BacktestBreakdown[];
  pickBreakdown: BacktestBreakdown[];
  equityCurve: Array<{ index: number; bankroll: number; profit: number }>;
};

type RiskPolicy = {
  minEdge: number;
  minConfidence: number;
  maxOdds: number;
  stakeMultiplier: number;
};

const OUTCOME_LABELS: Record<BacktestOutcome, string> = {
  homeWin: "主胜",
  draw: "平局",
  awayWin: "客胜",
};

const RISK_LABELS: Record<RiskLevel, string> = {
  conservative: "保守型",
  balanced: "稳健型",
  aggressive: "进取型",
};

const RISK_POLICIES: Record<RiskLevel, RiskPolicy> = {
  conservative: {
    minEdge: 2.8,
    minConfidence: 52,
    maxOdds: 2.55,
    stakeMultiplier: 0.72,
  },
  balanced: {
    minEdge: 1.2,
    minConfidence: 48,
    maxOdds: 3.45,
    stakeMultiplier: 1,
  },
  aggressive: {
    minEdge: 0.2,
    minConfidence: 43,
    maxOdds: 6.5,
    stakeMultiplier: 1.25,
  },
};

export const demoBacktestMatches: BacktestMatch[] = [
  {
    id: "epl-001",
    date: "2025-08-16",
    leagueId: 39,
    league: "英超",
    homeTeam: "阿森纳",
    awayTeam: "阿斯顿维拉",
    homeForm: "W-W-D-W-L",
    awayForm: "D-L-W-D-W",
    homeStats: { possession: 58, shots: 14, shotsOnTarget: 6, xG: 1.72, corners: 7 },
    awayStats: { possession: 42, shots: 8, shotsOnTarget: 3, xG: 0.88, corners: 3 },
    odds: { homeWin: 1.78, draw: 3.75, awayWin: 4.8, handicap: "主 -0.75", overUnder: "2.5" },
    result: { home: 1, away: 1 },
  },
  {
    id: "epl-002",
    date: "2025-09-01",
    leagueId: 39,
    league: "英超",
    homeTeam: "切尔西",
    awayTeam: "利物浦",
    homeForm: "W-D-L-W-W",
    awayForm: "W-W-D-W-D",
    homeStats: { possession: 49, shots: 11, shotsOnTarget: 4, xG: 1.22, corners: 5 },
    awayStats: { possession: 51, shots: 13, shotsOnTarget: 5, xG: 1.38, corners: 6 },
    odds: { homeWin: 2.95, draw: 3.6, awayWin: 2.28, handicap: "客 -0.25", overUnder: "2.75" },
    result: { home: 1, away: 2 },
  },
  {
    id: "epl-003",
    date: "2025-10-19",
    leagueId: 39,
    league: "英超",
    homeTeam: "曼城",
    awayTeam: "热刺",
    homeForm: "W-W-W-D-W",
    awayForm: "L-W-D-W-L",
    homeStats: { possession: 63, shots: 17, shotsOnTarget: 7, xG: 2.05, corners: 8 },
    awayStats: { possession: 37, shots: 7, shotsOnTarget: 2, xG: 0.78, corners: 2 },
    odds: { homeWin: 1.52, draw: 4.5, awayWin: 6.2, handicap: "主 -1", overUnder: "3" },
    result: { home: 1, away: 1 },
  },
  {
    id: "laliga-001",
    date: "2025-08-25",
    leagueId: 140,
    league: "西甲",
    homeTeam: "皇家马德里",
    awayTeam: "皇家社会",
    homeForm: "W-W-D-W-W",
    awayForm: "D-W-L-D-W",
    homeStats: { possession: 61, shots: 16, shotsOnTarget: 6, xG: 1.92, corners: 6 },
    awayStats: { possession: 39, shots: 9, shotsOnTarget: 3, xG: 0.91, corners: 4 },
    odds: { homeWin: 1.62, draw: 4.1, awayWin: 5.6, handicap: "主 -1", overUnder: "2.75" },
    result: { home: 3, away: 1 },
  },
  {
    id: "laliga-002",
    date: "2025-09-18",
    leagueId: 140,
    league: "西甲",
    homeTeam: "比利亚雷亚尔",
    awayTeam: "巴塞罗那",
    homeForm: "D-W-D-L-W",
    awayForm: "W-W-L-W-D",
    homeStats: { possession: 45, shots: 10, shotsOnTarget: 4, xG: 1.12, corners: 4 },
    awayStats: { possession: 55, shots: 15, shotsOnTarget: 5, xG: 1.48, corners: 7 },
    odds: { homeWin: 4.2, draw: 3.9, awayWin: 1.83, handicap: "客 -0.5", overUnder: "3" },
    result: { home: 2, away: 2 },
  },
  {
    id: "laliga-003",
    date: "2025-11-03",
    leagueId: 140,
    league: "西甲",
    homeTeam: "马德里竞技",
    awayTeam: "瓦伦西亚",
    homeForm: "W-D-W-W-L",
    awayForm: "L-D-W-L-D",
    homeStats: { possession: 54, shots: 13, shotsOnTarget: 5, xG: 1.44, corners: 5 },
    awayStats: { possession: 46, shots: 8, shotsOnTarget: 2, xG: 0.76, corners: 3 },
    odds: { homeWin: 1.85, draw: 3.4, awayWin: 4.65, handicap: "主 -0.5", overUnder: "2.25" },
    result: { home: 1, away: 0 },
  },
  {
    id: "bundesliga-001",
    date: "2025-09-14",
    leagueId: 78,
    league: "德甲",
    homeTeam: "拜仁慕尼黑",
    awayTeam: "莱比锡",
    homeForm: "W-W-W-D-W",
    awayForm: "W-L-W-D-W",
    homeStats: { possession: 59, shots: 18, shotsOnTarget: 8, xG: 2.28, corners: 9 },
    awayStats: { possession: 41, shots: 11, shotsOnTarget: 4, xG: 1.18, corners: 4 },
    odds: { homeWin: 1.68, draw: 4.25, awayWin: 4.6, handicap: "主 -0.75", overUnder: "3.25" },
    result: { home: 3, away: 2 },
  },
  {
    id: "bundesliga-002",
    date: "2025-10-05",
    leagueId: 78,
    league: "德甲",
    homeTeam: "多特蒙德",
    awayTeam: "勒沃库森",
    homeForm: "W-D-W-L-W",
    awayForm: "W-W-D-W-W",
    homeStats: { possession: 48, shots: 12, shotsOnTarget: 5, xG: 1.34, corners: 5 },
    awayStats: { possession: 52, shots: 13, shotsOnTarget: 5, xG: 1.51, corners: 5 },
    odds: { homeWin: 2.55, draw: 3.7, awayWin: 2.62, handicap: "平手", overUnder: "3" },
    result: { home: 0, away: 2 },
  },
  {
    id: "seriea-001",
    date: "2025-09-22",
    leagueId: 135,
    league: "意甲",
    homeTeam: "国际米兰",
    awayTeam: "罗马",
    homeForm: "W-W-D-W-L",
    awayForm: "D-W-L-D-W",
    homeStats: { possession: 55, shots: 14, shotsOnTarget: 5, xG: 1.58, corners: 6 },
    awayStats: { possession: 45, shots: 9, shotsOnTarget: 3, xG: 0.96, corners: 3 },
    odds: { homeWin: 1.92, draw: 3.35, awayWin: 4.25, handicap: "主 -0.5", overUnder: "2.25" },
    result: { home: 2, away: 1 },
  },
  {
    id: "seriea-002",
    date: "2025-10-27",
    leagueId: 135,
    league: "意甲",
    homeTeam: "那不勒斯",
    awayTeam: "AC 米兰",
    homeForm: "W-L-W-D-W",
    awayForm: "W-W-D-L-W",
    homeStats: { possession: 51, shots: 12, shotsOnTarget: 4, xG: 1.22, corners: 4 },
    awayStats: { possession: 49, shots: 11, shotsOnTarget: 4, xG: 1.2, corners: 5 },
    odds: { homeWin: 2.45, draw: 3.25, awayWin: 2.92, handicap: "主 -0.25", overUnder: "2.5" },
    result: { home: 1, away: 1 },
  },
  {
    id: "ligue1-001",
    date: "2025-09-07",
    leagueId: 61,
    league: "法甲",
    homeTeam: "巴黎圣日耳曼",
    awayTeam: "里尔",
    homeForm: "W-W-W-W-D",
    awayForm: "D-W-L-W-D",
    homeStats: { possession: 64, shots: 18, shotsOnTarget: 7, xG: 2.18, corners: 8 },
    awayStats: { possession: 36, shots: 7, shotsOnTarget: 2, xG: 0.68, corners: 3 },
    odds: { homeWin: 1.5, draw: 4.55, awayWin: 6.4, handicap: "主 -1", overUnder: "3" },
    result: { home: 1, away: 1 },
  },
  {
    id: "ligue1-002",
    date: "2025-11-11",
    leagueId: 61,
    league: "法甲",
    homeTeam: "马赛",
    awayTeam: "摩纳哥",
    homeForm: "W-D-L-W-D",
    awayForm: "W-W-D-L-W",
    homeStats: { possession: 50, shots: 11, shotsOnTarget: 4, xG: 1.16, corners: 5 },
    awayStats: { possession: 50, shots: 12, shotsOnTarget: 5, xG: 1.32, corners: 5 },
    odds: { homeWin: 2.7, draw: 3.45, awayWin: 2.55, handicap: "客 -0.25", overUnder: "2.75" },
    result: { home: 0, away: 1 },
  },
];

function actualOutcome(result: BacktestMatch["result"]): BacktestOutcome {
  if (result.home > result.away) return "homeWin";
  if (result.home < result.away) return "awayWin";
  return "draw";
}

function brierScore(match: BacktestMatch, probabilities: Record<BacktestOutcome, number>) {
  const actual = actualOutcome(match.result);
  return (["homeWin", "draw", "awayWin"] as const).reduce((sum, outcome) => {
    const probability = probabilities[outcome] / 100;
    const target = actual === outcome ? 1 : 0;
    return sum + (probability - target) ** 2;
  }, 0);
}

function maxDrawdown(values: number[]) {
  let peak = values[0] ?? 0;
  let drawdown = 0;

  values.forEach((value) => {
    peak = Math.max(peak, value);
    drawdown = Math.max(drawdown, peak - value);
  });

  return Math.round(drawdown);
}

function round(value: number, digits = 1) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function groupBreakdown(picks: BacktestPick[], group: (pick: BacktestPick) => string) {
  const groups = new Map<string, BacktestPick[]>();
  picks
    .filter((pick) => pick.pick !== "pass")
    .forEach((pick) => {
      const key = group(pick);
      groups.set(key, [...(groups.get(key) ?? []), pick]);
    });

  return [...groups.entries()]
    .map(([label, items]) => {
      const profit = items.reduce((sum, item) => sum + item.profit, 0);
      const stake = items.reduce((sum, item) => sum + item.stake, 0);
      const correct = items.filter((item) => item.correct).length;

      return {
        label,
        bets: items.length,
        hitRate: round((correct / Math.max(items.length, 1)) * 100, 1),
        profit: Math.round(profit),
        roi: round((profit / Math.max(stake, 1)) * 100, 1),
      };
    })
    .sort((a, b) => b.profit - a.profit);
}

function pickNote(edge: number | null, confidence: number) {
  if (edge == null) return "盘口缺少完整胜平负赔率，暂不计算价值差。";
  if (edge >= 6) return `模型明显高于市场 ${edge.toFixed(1)} 个百分点，置信度 ${confidence}%。`;
  if (edge >= 2) return `模型略高于市场 ${edge.toFixed(1)} 个百分点，置信度 ${confidence}%。`;
  return `价值差只有 ${edge.toFixed(1)} 个百分点，按当前风险偏好小注或跳过。`;
}

export function runBacktest(
  prefs: UserPreferences,
  matches: BacktestMatch[] = demoBacktestMatches
): RiskBacktestResult {
  const policy = RISK_POLICIES[prefs.risk_level];
  let bankroll = prefs.capital;
  let cumulativeProfit = 0;
  const equityCurve: RiskBacktestResult["equityCurve"] = [
    { index: 0, bankroll, profit: 0 },
  ];
  const brierValues: number[] = [];

  const picks = matches.map((match, index): BacktestPick => {
    const prediction = calculateFootballPrediction(match, prefs);
    const actual = actualOutcome(match.result);
    brierValues.push(
      brierScore(match, {
        homeWin: prediction.probabilities.homeWin,
        draw: prediction.probabilities.draw,
        awayWin: prediction.probabilities.awayWin,
      })
    );

    const candidate = prediction.valueSignals.find(
      (signal) =>
        signal.edge != null &&
        signal.offeredOdds != null &&
        signal.edge >= policy.minEdge &&
        signal.offeredOdds <= policy.maxOdds &&
        prediction.confidence >= policy.minConfidence
    );

    if (!candidate) {
      equityCurve.push({ index: index + 1, bankroll, profit: cumulativeProfit });
      return {
        matchId: match.id,
        date: match.date,
        league: match.league,
        match: `${match.homeTeam} vs ${match.awayTeam}`,
        pick: "pass",
        pickLabel: "跳过",
        actual,
        actualLabel: OUTCOME_LABELS[actual],
        odds: null,
        modelProbability: prediction.valueSignals[0]?.modelProbability ?? 0,
        marketProbability: prediction.valueSignals[0]?.marketProbability ?? null,
        edge: prediction.valueSignals[0]?.edge ?? null,
        stake: 0,
        profit: 0,
        correct: null,
        confidence: prediction.confidence,
        note: "价值差、赔率上限或置信度没有达到当前风险偏好的入场线。",
      };
    }

    const baseStake = prediction.staking.mainAmount || prefs.capital * 0.01;
    const stake = Math.max(1, Math.round(baseStake * policy.stakeMultiplier));
    const correct = candidate.market === actual;
    const profit = correct
      ? Math.round(stake * ((candidate.offeredOdds ?? 1) - 1))
      : -stake;

    cumulativeProfit += profit;
    bankroll += profit;
    equityCurve.push({
      index: index + 1,
      bankroll,
      profit: cumulativeProfit,
    });

    return {
      matchId: match.id,
      date: match.date,
      league: match.league,
      match: `${match.homeTeam} vs ${match.awayTeam}`,
      pick: candidate.market,
      pickLabel: candidate.label,
      actual,
      actualLabel: OUTCOME_LABELS[actual],
      odds: candidate.offeredOdds,
      modelProbability: candidate.modelProbability,
      marketProbability: candidate.marketProbability,
      edge: candidate.edge,
      stake,
      profit,
      correct,
      confidence: prediction.confidence,
      note: pickNote(candidate.edge, prediction.confidence),
    };
  });

  const bettingPicks = picks.filter((pick) => pick.pick !== "pass");
  const totalStake = bettingPicks.reduce((sum, pick) => sum + pick.stake, 0);
  const profit = bettingPicks.reduce((sum, pick) => sum + pick.profit, 0);
  const correct = bettingPicks.filter((pick) => pick.correct).length;
  const edgeSum = bettingPicks.reduce((sum, pick) => sum + (pick.edge ?? 0), 0);
  const confidenceSum = picks.reduce((sum, pick) => sum + pick.confidence, 0);

  return {
    riskLevel: prefs.risk_level,
    label: RISK_LABELS[prefs.risk_level],
    summary: {
      sampleLabel: "五大联赛校准样本",
      totalMatches: matches.length,
      betCount: bettingPicks.length,
      passCount: picks.length - bettingPicks.length,
      hitRate: round((correct / Math.max(bettingPicks.length, 1)) * 100, 1),
      brierScore: round(
        brierValues.reduce((sum, value) => sum + value, 0) / Math.max(brierValues.length, 1),
        3
      ),
      totalStake,
      profit: Math.round(profit),
      roi: round((profit / Math.max(totalStake, 1)) * 100, 1),
      maxDrawdown: maxDrawdown(equityCurve.map((item) => item.bankroll)),
      finalBankroll: Math.round(prefs.capital + profit),
      averageEdge: round(edgeSum / Math.max(bettingPicks.length, 1), 1),
      averageConfidence: round(confidenceSum / Math.max(picks.length, 1), 1),
    },
    picks,
    leagueBreakdown: groupBreakdown(picks, (pick) => pick.league),
    pickBreakdown: groupBreakdown(picks, (pick) => pick.pickLabel),
    equityCurve,
  };
}

export function runRiskComparison(capital = 1000) {
  const common = {
    capital,
    preferred_markets: ["胜平负", "让球", "大小球", "双方进球"],
    preferred_models: ["xG-Dixon-Coles", "赔率去水", "近期状态评分", "凯利风控"],
  };

  return [
    runBacktest({ ...common, risk_level: "conservative" }),
    runBacktest({ ...common, risk_level: "balanced" }),
    runBacktest({ ...common, risk_level: "aggressive" }),
  ];
}
