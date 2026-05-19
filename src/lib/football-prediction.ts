export type RiskLevel = "conservative" | "balanced" | "aggressive";

export interface UserPreferences {
  risk_level: RiskLevel;
  capital: number;
  preferred_markets: string[];
  preferred_models: string[];
}

export interface TeamStats {
  possession: number;
  shots: number;
  shotsOnTarget: number;
  xG: number;
  corners: number;
}

export interface MatchAnalysisData {
  homeTeam: string;
  awayTeam: string;
  league: string;
  homeForm: string;
  awayForm: string;
  homeStats: TeamStats;
  awayStats: TeamStats;
  odds: {
    homeWin: number;
    draw: number;
    awayWin: number;
    handicap: string;
    overUnder: string;
  };
}

export interface PredictionResult {
  modelVersion: string;
  expectedGoals: {
    home: number;
    away: number;
    total: number;
  };
  probabilities: {
    homeWin: number;
    draw: number;
    awayWin: number;
    over25: number;
    under25: number;
    bothTeamsToScore: number;
  };
  marketProbabilities: {
    homeWin: number | null;
    draw: number | null;
    awayWin: number | null;
  };
  predictedScore: {
    home: number;
    away: number;
    label: string;
  };
  confidence: number;
  valueSignals: Array<{
    market: "homeWin" | "draw" | "awayWin";
    label: string;
    modelProbability: number;
    marketProbability: number | null;
    edge: number | null;
    fairOdds: number;
    offeredOdds: number | null;
  }>;
  staking: {
    mainSelection: string;
    mainAmount: number;
    backupSelection: string;
    backupAmount: number;
    riskCapPercent: number;
  };
  notes: string[];
}

const OUTCOME_LABELS: Record<"homeWin" | "draw" | "awayWin", string> = {
  homeWin: "主胜",
  draw: "平局",
  awayWin: "客胜",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, digits = 1) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function decimalOdd(value: number) {
  return Number.isFinite(value) && value > 1 ? value : null;
}

function marketProbabilities(data: MatchAnalysisData["odds"]) {
  const odds = {
    homeWin: decimalOdd(data.homeWin),
    draw: decimalOdd(data.draw),
    awayWin: decimalOdd(data.awayWin),
  };

  if (!odds.homeWin || !odds.draw || !odds.awayWin) {
    return { homeWin: null, draw: null, awayWin: null };
  }

  const raw = {
    homeWin: 1 / odds.homeWin,
    draw: 1 / odds.draw,
    awayWin: 1 / odds.awayWin,
  };
  const overround = raw.homeWin + raw.draw + raw.awayWin;

  return {
    homeWin: raw.homeWin / overround,
    draw: raw.draw / overround,
    awayWin: raw.awayWin / overround,
  };
}

function parseGoalLine(line: string) {
  const match = line.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function formScore(form: string) {
  const tokens = form
    .split(/[-,\s]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 6);

  if (tokens.length === 0) return 0.5;

  const points = tokens.reduce((sum, item) => {
    if (item === "W") return sum + 3;
    if (item === "D") return sum + 1;
    return sum;
  }, 0);

  return points / (tokens.length * 3);
}

function statXg(stats: TeamStats) {
  if (Number.isFinite(stats.xG) && stats.xG > 0) return stats.xG;
  return clamp(
    stats.shotsOnTarget * 0.22 +
      Math.max(stats.shots - stats.shotsOnTarget, 0) * 0.045 +
      stats.corners * 0.035,
    0.25,
    3.2
  );
}

function poissonPmf(lambda: number, maxGoals: number) {
  const values: number[] = [];
  values[0] = Math.exp(-lambda);
  for (let i = 1; i <= maxGoals; i += 1) {
    values[i] = (values[i - 1] * lambda) / i;
  }
  return values;
}

function dixonColesTau(homeGoals: number, awayGoals: number, homeXg: number, awayXg: number) {
  const rho = -0.07;

  if (homeGoals === 0 && awayGoals === 0) {
    return 1 - homeXg * awayXg * rho;
  }
  if (homeGoals === 0 && awayGoals === 1) {
    return 1 + homeXg * rho;
  }
  if (homeGoals === 1 && awayGoals === 0) {
    return 1 + awayXg * rho;
  }
  if (homeGoals === 1 && awayGoals === 1) {
    return 1 - rho;
  }

  return 1;
}

function buildScoreMatrix(homeXg: number, awayXg: number) {
  const maxGoals = 8;
  const homePmf = poissonPmf(homeXg, maxGoals);
  const awayPmf = poissonPmf(awayXg, maxGoals);
  const matrix: number[][] = [];
  let total = 0;

  for (let home = 0; home <= maxGoals; home += 1) {
    matrix[home] = [];
    for (let away = 0; away <= maxGoals; away += 1) {
      const adjusted = Math.max(
        homePmf[home] * awayPmf[away] * dixonColesTau(home, away, homeXg, awayXg),
        0
      );
      matrix[home][away] = adjusted;
      total += adjusted;
    }
  }

  for (let home = 0; home <= maxGoals; home += 1) {
    for (let away = 0; away <= maxGoals; away += 1) {
      matrix[home][away] = matrix[home][away] / total;
    }
  }

  return matrix;
}

function riskSettings(level: RiskLevel) {
  const settings: Record<RiskLevel, { cap: number; kellyFraction: number }> = {
    conservative: { cap: 0.04, kellyFraction: 0.18 },
    balanced: { cap: 0.07, kellyFraction: 0.25 },
    aggressive: { cap: 0.1, kellyFraction: 0.35 },
  };
  return settings[level] ?? settings.balanced;
}

function stakeFor(probability: number, odds: number | null, prefs: UserPreferences) {
  const risk = riskSettings(prefs.risk_level);

  if (!odds || odds <= 1) {
    return Math.round(prefs.capital * risk.cap * 0.35);
  }

  const b = odds - 1;
  const kelly = (probability * b - (1 - probability)) / b;
  const fraction = clamp(kelly * risk.kellyFraction, 0, risk.cap);
  return Math.round(prefs.capital * fraction);
}

export function calculateFootballPrediction(
  data: MatchAnalysisData,
  prefs: UserPreferences
): PredictionResult {
  const market = marketProbabilities(data.odds);
  const homeMarket = market.homeWin ?? 0.42;
  const awayMarket = market.awayWin ?? 0.3;
  const marketTilt = homeMarket - awayMarket;

  const homeForm = formScore(data.homeForm);
  const awayForm = formScore(data.awayForm);
  const formTilt = homeForm - awayForm;

  const homeStatXg = statXg(data.homeStats);
  const awayStatXg = statXg(data.awayStats);
  const xgTilt = homeStatXg - awayStatXg;
  const shotTilt = data.homeStats.shotsOnTarget - data.awayStats.shotsOnTarget;
  const possessionTilt = (data.homeStats.possession - data.awayStats.possession) / 100;

  let homeXg = 1.28 + 0.2 + marketTilt * 0.75 + formTilt * 0.38 + xgTilt * 0.42 + shotTilt * 0.055 + possessionTilt * 0.3;
  let awayXg = 1.08 - marketTilt * 0.58 - formTilt * 0.28 - xgTilt * 0.32 - shotTilt * 0.045 - possessionTilt * 0.22;

  homeXg = clamp(homeXg, 0.25, 3.9);
  awayXg = clamp(awayXg, 0.2, 3.6);

  const goalLine = parseGoalLine(data.odds.overUnder);
  if (goalLine) {
    const targetTotal = clamp(goalLine, 1.6, 4.4);
    const blendedTotal = (homeXg + awayXg) * 0.65 + targetTotal * 0.35;
    const scale = blendedTotal / Math.max(homeXg + awayXg, 0.1);
    homeXg = clamp(homeXg * scale, 0.25, 4.2);
    awayXg = clamp(awayXg * scale, 0.2, 3.9);
  }

  const matrix = buildScoreMatrix(homeXg, awayXg);

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let over25 = 0;
  let bothTeamsToScore = 0;
  let bestScore = { home: 0, away: 0, probability: 0 };

  matrix.forEach((awayRows, home) => {
    awayRows.forEach((probability, away) => {
      if (home > away) homeWin += probability;
      else if (home === away) draw += probability;
      else awayWin += probability;

      if (home + away >= 3) over25 += probability;
      if (home > 0 && away > 0) bothTeamsToScore += probability;
      if (probability > bestScore.probability) {
        bestScore = { home, away, probability };
      }
    });
  });

  const probabilities = {
    homeWin,
    draw,
    awayWin,
    over25,
    under25: 1 - over25,
    bothTeamsToScore,
  };

  const orderedSignals = (["homeWin", "draw", "awayWin"] as const)
    .map((marketName) => {
      const modelProbability = probabilities[marketName];
      const marketProbability = market[marketName];
      const offeredOdds = decimalOdd(data.odds[marketName]);
      return {
        market: marketName,
        label: OUTCOME_LABELS[marketName],
        modelProbability,
        marketProbability,
        edge: marketProbability == null ? null : modelProbability - marketProbability,
        fairOdds: round(1 / Math.max(modelProbability, 0.01), 2),
        offeredOdds,
      };
    })
    .sort((a, b) => (b.edge ?? b.modelProbability - 0.33) - (a.edge ?? a.modelProbability - 0.33));

  const main = orderedSignals[0];
  const backup = orderedSignals[1];
  const risk = riskSettings(prefs.risk_level);

  const outcomeValues = [homeWin, draw, awayWin];
  const entropy =
    -outcomeValues.reduce((sum, value) => sum + value * Math.log(Math.max(value, 0.0001)), 0) /
    Math.log(3);
  const confidence = clamp(Math.round(38 + (1 - entropy) * 48 + Math.abs(homeWin - awayWin) * 18), 35, 88);

  return {
    modelVersion: "xG-Dixon-Coles-v1",
    expectedGoals: {
      home: round(homeXg, 2),
      away: round(awayXg, 2),
      total: round(homeXg + awayXg, 2),
    },
    probabilities: {
      homeWin: round(homeWin * 100, 1),
      draw: round(draw * 100, 1),
      awayWin: round(awayWin * 100, 1),
      over25: round(over25 * 100, 1),
      under25: round((1 - over25) * 100, 1),
      bothTeamsToScore: round(bothTeamsToScore * 100, 1),
    },
    marketProbabilities: {
      homeWin: market.homeWin == null ? null : round(market.homeWin * 100, 1),
      draw: market.draw == null ? null : round(market.draw * 100, 1),
      awayWin: market.awayWin == null ? null : round(market.awayWin * 100, 1),
    },
    predictedScore: {
      home: bestScore.home,
      away: bestScore.away,
      label: `${bestScore.home}-${bestScore.away}`,
    },
    confidence,
    valueSignals: orderedSignals.map((signal) => ({
      ...signal,
      modelProbability: round(signal.modelProbability * 100, 1),
      marketProbability: signal.marketProbability == null ? null : round(signal.marketProbability * 100, 1),
      edge: signal.edge == null ? null : round(signal.edge * 100, 1),
    })),
    staking: {
      mainSelection: main.label,
      mainAmount: stakeFor(main.modelProbability, main.offeredOdds, prefs),
      backupSelection: backup.label,
      backupAmount: Math.round(stakeFor(backup.modelProbability, backup.offeredOdds, prefs) * 0.6),
      riskCapPercent: round(risk.cap * 100, 1),
    },
    notes: [
      "该模型用赔率去水概率、近期状态、xG、射正、控球和角球估计双方进球强度。",
      "比分分布采用泊松矩阵，并对低比分相关性做 Dixon-Coles 修正。",
      "模拟积分是风控上限建议，不代表确定收益；临场阵容和伤停会显著改变概率。",
    ],
  };
}

export function formatPredictionSummary(data: MatchAnalysisData, prediction: PredictionResult) {
  const top = prediction.valueSignals[0];
  const edgeText =
    top.edge == null
      ? "当前赔率不足，暂不计算价值差"
      : `${top.edge > 0 ? "模型高于市场" : "模型低于市场"} ${Math.abs(top.edge).toFixed(1)} 个百分点`;

  return [
    "ScoutAI 数学模型分析",
    `比赛：${data.homeTeam} vs ${data.awayTeam}`,
    `模型：${prediction.modelVersion}，置信度 ${prediction.confidence}%`,
    `预期进球：${prediction.expectedGoals.home.toFixed(2)} - ${prediction.expectedGoals.away.toFixed(2)}，最可能比分 ${prediction.predictedScore.label}`,
    `胜平负概率：主胜 ${prediction.probabilities.homeWin}% / 平局 ${prediction.probabilities.draw}% / 客胜 ${prediction.probabilities.awayWin}%`,
    `大小球：大 2.5 概率 ${prediction.probabilities.over25}%；双方进球概率 ${prediction.probabilities.bothTeamsToScore}%`,
    `价值信号：${top.label}，${edgeText}，模型公平赔率 ${top.fairOdds.toFixed(2)}`,
    `风控建议：主推 ${prediction.staking.mainSelection}，模拟积分 ${prediction.staking.mainAmount}；备选 ${prediction.staking.backupSelection}，模拟积分 ${prediction.staking.backupAmount}；单场风险上限 ${prediction.staking.riskCapPercent}%`,
    "风险提示：足球低比分随机性很强，临场阵容、红牌、天气和赛程轮换会改变结论；只把它当作概率工具。",
  ].join("\n");
}
