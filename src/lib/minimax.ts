export interface UserPreferences {
  risk_level: "conservative" | "balanced" | "aggressive";
  capital: number;
  preferred_markets: string[];
  preferred_models: string[];
}

export interface MatchAnalysisData {
  homeTeam: string;
  awayTeam: string;
  league: string;
  homeForm: string;   // e.g. "W-D-W-L-W"
  awayForm: string;
  homeStats: {
    possession: number;
    shots: number;
    shotsOnTarget: number;
    xG: number;
    corners: number;
  };
  awayStats: {
    possession: number;
    shots: number;
    shotsOnTarget: number;
    xG: number;
    corners: number;
  };
  odds: {
    homeWin: number;
    draw: number;
    awayWin: number;
    handicap: string;
    overUnder: string;
  };
}

function translateRiskLevel(level: string): string {
  return { conservative: "保守型", balanced: "稳健型", aggressive: "激进型" }[level] ?? "稳健型";
}

function calculatePositions(riskLevel: string, capital: number) {
  const ratios: Record<string, { main: number; backup: number }> = {
    conservative: { main: 0.05, backup: 0.03 },
    balanced:     { main: 0.08, backup: 0.05 },
    aggressive:   { main: 0.12, backup: 0.07 },
  };
  const r = ratios[riskLevel] ?? ratios.balanced;
  return {
    main:   Math.round(capital * r.main),
    backup: Math.round(capital * r.backup),
  };
}

function buildPrompt(data: MatchAnalysisData, prefs: UserPreferences): string {
  const positions = calculatePositions(prefs.risk_level, prefs.capital);
  const markets = prefs.preferred_markets.length > 0
    ? prefs.preferred_markets.join("、")
    : "让球、大小球";
  const models = prefs.preferred_models.length > 0
    ? prefs.preferred_models.join(" + ")
    : "多模型融合";

  return `请分析以下足球比赛，严格按照指定格式输出，约300字。

【比赛信息】
对阵：${data.homeTeam}（主）vs ${data.awayTeam}（客）
联赛：${data.league}

【比赛数据】
近期状态：主队 ${data.homeForm}，客队 ${data.awayForm}
主队数据：控球 ${data.homeStats.possession}%，射门 ${data.homeStats.shots}（射正 ${data.homeStats.shotsOnTarget}），xG ${data.homeStats.xG.toFixed(2)}，角球 ${data.homeStats.corners}
客队数据：控球 ${data.awayStats.possession}%，射门 ${data.awayStats.shots}（射正 ${data.awayStats.shotsOnTarget}），xG ${data.awayStats.xG.toFixed(2)}，角球 ${data.awayStats.corners}
赔率：主胜 ${data.odds.homeWin} / 平 ${data.odds.draw} / 客胜 ${data.odds.awayWin}
让球：${data.odds.handicap}，大小球：${data.odds.overUnder}

【用户画像】
风险偏好：${translateRiskLevel(prefs.risk_level)}
投资资金：${prefs.capital} CNY
关注市场：${markets}
分析模型：${models}

【输出格式】严格按照以下格式，不添加多余内容：

━━━ 📊 ScoutAI 智能分析 ━━━

【状态分析】
（2-3行：基于近期战绩和场内数据的判断）

【赔率解读】
（1-2行：当前赔率价值分析，是否存在偏差）

━━━ 💡 投注建议（${models}）━━━

主推：${prefs.preferred_markets[0] ?? "让球"}
推荐：[具体选择]
建议金额：${positions.main} CNY
理由：[2行数据支撑]

备选：${prefs.preferred_markets[1] ?? "大小球"}
推荐：[具体选择]
建议金额：${positions.backup} CNY
理由：[1行]

━━━ ⚠️ 风险提示 ━━━
[2条风险点，简洁直接]

注意：只分析用户关注的市场（${markets}），数据须真实，不要编造具体比分或赔率数值。`;
}

export async function analyzeWithMinimax(
  data: MatchAnalysisData,
  prefs: UserPreferences
): Promise<string> {
  const apiKey = process.env.MINIMAX_API_KEY;
  const groupId = process.env.MINIMAX_GROUP_ID;

  if (!apiKey || !groupId) {
    throw new Error("MINIMAX_API_KEY 或 MINIMAX_GROUP_ID 未配置");
  }

  const prompt = buildPrompt(data, prefs);

  const res = await fetch(
    `https://api.minimax.chat/v1/text/chatcompletion_v2`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "abab6.5s-chat",
        messages: [
          {
            role: "system",
            content: "你是一位专业的足球数据分析师，擅长用数据驱动的方式给出精准投注建议。回答简洁、专业、直接。",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 1024,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[MiniMax] API error:", res.status, err);
    throw new Error(`MiniMax API 请求失败: ${res.status}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("MiniMax 返回内容为空");
  return content;
}
