// 联赛权重（含 api-football + football-data.org 双 ID 体系）
const LEAGUE_WEIGHTS: Record<number, number> = {
  // 欧冠 / 世界杯（最高优先级）
  2: 40, 2001: 40,       // 欧冠
  1: 40, 2000: 40,       // 世界杯
  4: 38, 2018: 38,       // 欧洲杯

  // 五大联赛
  39: 35, 2021: 35,      // 英超
  140: 35, 2014: 35,     // 西甲
  135: 35, 2019: 35,     // 意甲
  78: 35, 2002: 35,      // 德甲
  61: 35, 2015: 35,      // 法甲

  // 欧洲杯赛
  3: 32,                 // 欧联杯
  848: 28,               // 欧协联

  // 国际赛事
  5: 26,                 // 亚洲杯
  9: 26, 2152: 26,       // 美洲杯
  17: 24,                // 亚冠

  // 次级联赛 / 其他
  40: 22, 2016: 22,      // 英冠
  141: 22,               // 西乙
  136: 22,               // 意乙
  79: 22,                // 德乙
  62: 22,                // 法乙
  88: 20,                // 荷甲
  94: 20,                // 葡超
  253: 18,               // MLS
  169: 16,               // 中超
  98: 15,                // 日职联
  292: 15,               // 韩K联
};

// 豪门球队（英文原名）
const BIG_CLUBS = new Set([
  // 英超
  "Manchester City", "Manchester United", "Liverpool",
  "Chelsea", "Arsenal", "Tottenham Hotspur", "Tottenham",
  "Aston Villa", "Newcastle United",
  // 西甲
  "Real Madrid", "Real Madrid CF", "Barcelona", "FC Barcelona",
  "Atletico Madrid", "Atlético Madrid", "Atletico de Madrid",
  // 意甲
  "Juventus", "Inter", "Inter Milan", "FC Internazionale",
  "AC Milan", "Milan", "Napoli", "AS Roma", "Roma", "Lazio", "Atalanta",
  // 德甲
  "Bayern Munich", "Bayern München", "FC Bayern München",
  "Borussia Dortmund", "RB Leipzig", "Bayer Leverkusen",
  // 法甲
  "Paris Saint-Germain", "Paris Saint Germain", "PSG",
  "Marseille", "Olympique de Marseille", "Lyon", "Olympique Lyonnais", "Monaco", "AS Monaco",
  // 欧冠常客
  "Benfica", "SL Benfica", "Porto", "FC Porto",
  "Ajax", "AFC Ajax", "PSV Eindhoven",
  "Celtic", "Rangers",
  "Shakhtar Donetsk", "Galatasaray",
]);

export interface HotScoreInput {
  leagueId: number;
  homeTeam: string;       // 英文原名
  awayTeam: string;       // 英文原名
  status: "live" | "upcoming" | "finished";
  date?: string;          // ISO 字符串
  minute?: number;        // 比赛分钟数（进行中）
  homeScore?: number;
  awayScore?: number;
  isUserFavoriteLeague?: boolean;
}

export function calculateHotScore(m: HotScoreInput): number {
  let score = 0;

  // 1. 联赛权重（最高 40 分）
  score += LEAGUE_WEIGHTS[m.leagueId] ?? 10;

  // 2. 豪门加成（最高 25 分）
  const homeBig = BIG_CLUBS.has(m.homeTeam);
  const awayBig = BIG_CLUBS.has(m.awayTeam);
  if (homeBig && awayBig) score += 25;
  else if (homeBig || awayBig) score += 15;
  else score += 5;

  // 3. 用户关注联赛加成（10 分）
  if (m.isUserFavoriteLeague) score += 10;

  // 4. 时间因素（最高 10 分）
  if (m.status === "live") {
    score += 10;
  } else if (m.status === "upcoming" && m.date) {
    const hoursUntil = (new Date(m.date).getTime() - Date.now()) / 3_600_000;
    if (hoursUntil <= 3)       score += 10; // 3 小时内开赛
    else if (hoursUntil <= 24) score += 8;  // 今天
    else if (hoursUntil <= 48) score += 5;  // 明天
    else if (hoursUntil <= 72) score += 3;  // 后天
    else                       score += 1;
  }

  // 5. 进行中：紧张程度加成（最高 15 分）
  if (m.status === "live") {
    const diff = Math.abs((m.homeScore ?? 0) - (m.awayScore ?? 0));
    if (diff === 0)      score += 15; // 平局
    else if (diff === 1) score += 9;
    else if (diff === 2) score += 4;
  }

  // 6. 进行中：比赛时段加成（最高 10 分）
  if (m.status === "live") {
    const min = m.minute ?? 0;
    if (min >= 80)      score += 10; // 伤停补时
    else if (min >= 70) score += 7;
    else if (min >= 45) score += 4;
    else                score += 2;
  }

  return Math.min(Math.max(Math.round(score), 0), 100);
}
