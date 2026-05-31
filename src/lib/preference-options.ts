export type RiskLevel = "conservative" | "balanced" | "aggressive";
export type Currency = "USD" | "CNY" | "HKD";

export type PreferenceOption = {
  id: string;
  label: string;
  description: string;
  badge?: string;
};

export type RiskProfile = {
  id: RiskLevel;
  label: string;
  tone: string;
  summary: string;
  recommended: string;
  models: string[];
  markets: string[];
  betTypes: string[];
};

export const DEFAULT_SIMULATED_POINTS = 1000;

export const modelOptions: PreferenceOption[] = [
  {
    id: "xG-Dixon-Coles",
    label: "进球分布模型",
    badge: "核心",
    description: "把 xG、射门和主客场差异转成比分概率，适合看胜平负和进球数。",
  },
  {
    id: "赔率去水",
    label: "市场概率校准",
    badge: "核心",
    description: "把公开市场指数转成隐含概率，用来比较模型判断和市场预期的差距。",
  },
  {
    id: "近期状态评分",
    label: "近期状态评分",
    description: "结合近况、射正、控球和角球，避免只看单一市场信号导致判断太单薄。",
  },
  {
    id: "凯利风控",
    label: "策略占比上限",
    description: "根据风险偏好给出单场观察占比上限，防止单场波动过大。",
  },
  {
    id: "爆冷检测",
    label: "冷门风险检测",
    description: "重点检查平局、客胜和低热度方向，提醒可能被忽略的异常风险。",
  },
];

export const marketOptions: PreferenceOption[] = [
  {
    id: "胜平负",
    label: "胜平负",
    badge: "核心",
    description: "判断主胜、平局、客胜，是所有赛前分析的基础口径。",
  },
  {
    id: "让球",
    label: "让球 / 亚洲让球",
    badge: "核心",
    description: "强弱差明显时更有用，关注热门队的让球线是否偏深。",
  },
  {
    id: "大小球",
    label: "大小球",
    badge: "核心",
    description: "围绕总进球数做判断，适合结合 xG、节奏和临场市场线变化。",
  },
  {
    id: "双方进球",
    label: "双方进球",
    description: "判断两队是否都有进球能力，适合攻强守弱或开放节奏比赛。",
  },
  {
    id: "双重机会",
    label: "双重机会",
    description: "把两个结果合并观察，例如主队不败、客队不败，波动更低。",
  },
  {
    id: "平局退款",
    label: "平局退款",
    description: "平局时降低损失，适合胜负倾向明确但平局风险不低的比赛。",
  },
  {
    id: "半场胜平负",
    label: "半场胜平负",
    description: "看上半场走势，适合强队开局压制或慢热球队的节奏分析。",
  },
  {
    id: "半全场",
    label: "半全场",
    description: "同时观察半场和全场结果，波动更高，适合进取型用户做赛前观察。",
  },
  {
    id: "比分",
    label: "比分",
    description: "来自比分分布矩阵，波动最高，更适合作为参考信号。",
  },
  {
    id: "球队进球数",
    label: "球队进球数",
    description: "拆开看单队进球能力，适合强弱分明或一方防线明显不稳的场次。",
  },
  {
    id: "角球",
    label: "角球",
    description: "关注边路压制和射门压力，等实时数据更完整后会更有价值。",
  },
  {
    id: "红黄牌",
    label: "红黄牌",
    description: "关注对抗强度、德比和淘汰赛压力，暂作为风险观察项。",
  },
];

export const betTypeOptions: PreferenceOption[] = [
  {
    id: "单场",
    label: "单场分析",
    description: "每场独立判断，最适合当前版本。",
  },
  {
    id: "热门场次优先",
    label: "热门场次优先",
    description: "优先看热度高、信息更多的比赛。",
  },
  {
    id: "低波动组合",
    label: "低波动单场",
    description: "倾向双重机会、平局退款等更稳的单场观察方向。",
  },
  {
    id: "高波动机会",
    label: "高波动机会",
    description: "关注比分、半全场和爆冷方向，波动更大。",
  },
  {
    id: "爆冷监控",
    label: "爆冷监控",
    description: "当热门方向过热时，重点提醒冷门风险。",
  },
];

export const riskProfiles: Record<RiskLevel, RiskProfile> = {
  conservative: {
    id: "conservative",
    label: "保守型",
    tone: "少动、稳一点",
    summary: "优先看低波动口径，减少高波动方向干扰。",
    recommended: "适合刚开始使用，或者只想看更稳的比赛判断。",
    models: ["xG-Dixon-Coles", "赔率去水", "凯利风控"],
    markets: ["胜平负", "让球", "大小球", "双重机会", "平局退款"],
    betTypes: ["单场", "低波动组合"],
  },
  balanced: {
    id: "balanced",
    label: "稳健型",
    tone: "默认推荐",
    summary: "兼顾概率、市场线和进球数，适合大多数用户。",
    recommended: "系统默认方案，既看主流口径，也会提醒冷门风险。",
    models: ["xG-Dixon-Coles", "赔率去水", "近期状态评分", "凯利风控", "爆冷检测"],
    markets: ["胜平负", "让球", "大小球", "双方进球", "双重机会", "球队进球数"],
    betTypes: ["单场", "热门场次优先", "爆冷监控"],
  },
  aggressive: {
    id: "aggressive",
    label: "进取型",
    tone: "机会更多",
    summary: "会关注更高波动口径，适合愿意看冷门和比分方向的用户。",
    recommended: "适合想多看机会点的人，但结果波动也会明显更大。",
    models: ["xG-Dixon-Coles", "赔率去水", "近期状态评分", "凯利风控", "爆冷检测"],
    markets: ["胜平负", "让球", "大小球", "双方进球", "比分", "半全场", "半场胜平负", "角球"],
    betTypes: ["单场", "高波动机会", "爆冷监控"],
  },
};

export const riskProfileList = [
  riskProfiles.conservative,
  riskProfiles.balanced,
  riskProfiles.aggressive,
];

export const leagueOptions = [
  { id: 39, name: "英超", short: "ENG", description: "节奏快，热门场次多" },
  { id: 140, name: "西甲", short: "ESP", description: "强队盘和技术流对比" },
  { id: 78, name: "德甲", short: "GER", description: "进球节奏和大小球更活跃" },
  { id: 61, name: "法甲", short: "FRA", description: "强弱差和冷门风险并存" },
  { id: 135, name: "意甲", short: "ITA", description: "防守结构和平局权重更高" },
  { id: 1, name: "世界杯", short: "FIFA", description: "杯赛淘汰制和临场波动" },
];

export const leagueGroups = [
  {
    group: "五大联赛与世界杯",
    items: leagueOptions,
  },
];

export const defaultLeagueIds = [39, 140, 78, 135, 61, 1];
export const defaultLeagueNames = leagueOptions.map((league) => league.name);

export const defaultPreferenceValues = {
  risk_level: riskProfiles.balanced.id,
  capital: DEFAULT_SIMULATED_POINTS,
  currency: "CNY" as Currency,
  preferred_models: riskProfiles.balanced.models,
  bet_type: riskProfiles.balanced.betTypes,
  preferred_markets: riskProfiles.balanced.markets,
  favorite_leagues: defaultLeagueNames,
};

export function toggleString(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function normalizeOptionIds(
  value: unknown,
  options: PreferenceOption[],
  fallback: string[]
) {
  if (!Array.isArray(value)) return fallback;
  const allowed = new Set(options.map((option) => option.id));
  const normalized = value.filter(
    (item): item is string => typeof item === "string" && allowed.has(item)
  );
  return normalized.length > 0 ? normalized : fallback;
}

export function displayPreferenceLabel(value: string) {
  const option = [...modelOptions, ...marketOptions, ...betTypeOptions].find(
    (item) => item.id === value
  );
  return option?.label ?? value;
}
