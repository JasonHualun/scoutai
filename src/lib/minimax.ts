import {
  calculateFootballPrediction,
  formatPredictionSummary,
  MatchAnalysisData,
  PredictionResult,
  UserPreferences,
} from "./football-prediction";

export type { MatchAnalysisData, PredictionResult, UserPreferences };

type Provider = "openai" | "anthropic" | "minimax" | "local";

const ANALYSIS_SYSTEM_PROMPT =
  "你是一个严谨的足球量化分析师。你必须尊重输入中的数学概率，不要承诺收益，不要制造事实，只输出中文。";

function preferredProvider(): Provider {
  const configured = process.env.AI_PROVIDER?.toLowerCase();
  if (
    configured === "openai" ||
    configured === "anthropic" ||
    configured === "minimax" ||
    configured === "local"
  ) {
    return configured;
  }
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.MINIMAX_API_KEY && process.env.MINIMAX_GROUP_ID) return "minimax";
  return "local";
}

function safeNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function apiUrl(baseUrl: string | undefined, fallbackBaseUrl: string, path: string) {
  const root = (baseUrl || fallbackBaseUrl).replace(/\/+$/, "");
  const versionedRoot = root.endsWith("/v1") ? root : `${root}/v1`;
  return `${versionedRoot}${path}`;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function payloadMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;

  const data = payload as {
    error?: { message?: unknown };
    base_resp?: { status_msg?: unknown };
    raw?: unknown;
  };

  if (typeof data.error?.message === "string") return data.error.message;
  if (typeof data.base_resp?.status_msg === "string") return data.base_resp.status_msg;
  if (typeof data.raw === "string" && data.raw.length > 0) return data.raw.slice(0, 300);

  return fallback;
}

function translateRiskLevel(level: UserPreferences["risk_level"]): string {
  return {
    conservative: "保守型",
    balanced: "稳健型",
    aggressive: "进取型",
  }[level];
}

function buildPrompt(
  data: MatchAnalysisData,
  prefs: UserPreferences,
  prediction: PredictionResult
) {
  return `你是 ScoutAI 的足球量化分析引擎。请基于下列确定性模型结果生成中文分析，不能编造不存在的伤停、阵容、赔率或比分。

任务要求：
1. 以概率和风险为核心，不承诺收益。
2. 先解释模型判断，再给出主推、备选、模拟积分和风险点。
3. 如果市场价值差不明显，要明确提示谨慎或放弃。
4. 输出控制在 700 字以内，结构清晰。

比赛：
- 对阵：${data.homeTeam} vs ${data.awayTeam}
- 联赛：${data.league}
- 主队近况：${data.homeForm}
- 客队近况：${data.awayForm}
- 主队数据：控球 ${data.homeStats.possession}%，射门 ${data.homeStats.shots}，射正 ${data.homeStats.shotsOnTarget}，xG ${data.homeStats.xG}，角球 ${data.homeStats.corners}
- 客队数据：控球 ${data.awayStats.possession}%，射门 ${data.awayStats.shots}，射正 ${data.awayStats.shotsOnTarget}，xG ${data.awayStats.xG}，角球 ${data.awayStats.corners}
- 欧赔：主胜 ${data.odds.homeWin} / 平 ${data.odds.draw} / 客胜 ${data.odds.awayWin}
- 盘口：${data.odds.handicap}
- 大小球：${data.odds.overUnder}

用户画像：
- 风险偏好：${translateRiskLevel(prefs.risk_level)}
- 模拟积分：${prefs.capital}
- 关注市场：${prefs.preferred_markets.join("、") || "胜平负、让球、大小球、双方进球"}
- 偏好模型：${prefs.preferred_models.join(" + ") || "数学模型 + 大模型解释"}

确定性模型结果：
${formatPredictionSummary(data, prediction)}

请按以下格式输出：
【模型结论】
【概率拆解】
【策略建议】
【风险提示】`;
}

function extractOpenAIText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const data = payload as {
    output_text?: unknown;
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  if (typeof data.output_text === "string") return data.output_text;

  return (
    data.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("\n")
      .trim() ?? ""
  );
}

function extractChatCompletionText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";

  const data = payload as {
    choices?: Array<{
      message?: { content?: unknown };
      text?: unknown;
    }>;
  };

  const firstChoice = data.choices?.[0];
  if (typeof firstChoice?.message?.content === "string") return firstChoice.message.content.trim();
  if (typeof firstChoice?.text === "string") return firstChoice.text.trim();

  return "";
}

function extractAnthropicText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";

  const data = payload as {
    content?: Array<{ type?: string; text?: unknown }>;
  };

  return (
    data.content
      ?.filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("\n")
      .trim() ?? ""
  );
}

async function callOpenAI(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY 未配置");

  const model = process.env.OPENAI_MODEL || "gpt-5.5";
  const reasoningEffort = process.env.OPENAI_REASONING_EFFORT || "xhigh";
  const maxOutputTokens = safeNumber(process.env.OPENAI_MAX_OUTPUT_TOKENS, 128000);
  const mode = process.env.OPENAI_API_MODE?.toLowerCase() || "responses";

  if (mode === "chat") {
    const res = await fetch(apiUrl(process.env.OPENAI_BASE_URL, "https://api.openai.com", "/chat/completions"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: ANALYSIS_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2,
        max_tokens: maxOutputTokens,
      }),
    });

    const json = await readJson(res);
    if (!res.ok) {
      throw new Error(payloadMessage(json, `OpenAI 兼容接口请求失败: ${res.status}`));
    }

    const content = extractChatCompletionText(json);
    if (!content) throw new Error("OpenAI 兼容接口返回内容为空");
    return content;
  }

  const res = await fetch(apiUrl(process.env.OPENAI_BASE_URL, "https://api.openai.com", "/responses"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: ANALYSIS_SYSTEM_PROMPT,
      input: prompt,
      reasoning: { effort: reasoningEffort },
      max_output_tokens: maxOutputTokens,
      store: false,
    }),
  });

  const json = await readJson(res);
  if (!res.ok) {
    throw new Error(payloadMessage(json, `OpenAI API 请求失败: ${res.status}`));
  }

  const content = extractOpenAIText(json);
  if (!content) throw new Error("OpenAI 返回内容为空");
  return content;
}

async function callAnthropic(prompt: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 未配置");

  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const maxTokens = safeNumber(process.env.ANTHROPIC_MAX_TOKENS, 4096);

  const res = await fetch(
    apiUrl(process.env.ANTHROPIC_BASE_URL, "https://api.anthropic.com", "/messages"),
    {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": process.env.ANTHROPIC_VERSION || "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        system: ANALYSIS_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
    }
  );

  const json = await readJson(res);
  if (!res.ok) {
    throw new Error(payloadMessage(json, `Anthropic API 请求失败: ${res.status}`));
  }

  const content = extractAnthropicText(json);
  if (!content) throw new Error("Anthropic 返回内容为空");
  return content;
}

async function callMinimax(prompt: string) {
  const apiKey = process.env.MINIMAX_API_KEY;
  const groupId = process.env.MINIMAX_GROUP_ID;

  if (!apiKey || !groupId) {
    throw new Error("MINIMAX_API_KEY 或 MINIMAX_GROUP_ID 未配置");
  }

  const res = await fetch("https://api.minimax.chat/v1/text/chatcompletion_v2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.MINIMAX_MODEL || "abab6.5s-chat",
      messages: [
        {
          role: "system",
          content: ANALYSIS_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: safeNumber(process.env.MINIMAX_MAX_TOKENS, 2048),
    }),
  });

  const json = await readJson(res);
  if (!res.ok) {
    throw new Error(payloadMessage(json, `MiniMax API 请求失败: ${res.status}`));
  }

  const content = extractChatCompletionText(json);
  if (!content) throw new Error("MiniMax 返回内容为空");
  return content;
}

export function calculateAnalysisPrediction(data: MatchAnalysisData, prefs: UserPreferences) {
  return calculateFootballPrediction(data, prefs);
}

export async function analyzeWithMinimax(
  data: MatchAnalysisData,
  prefs: UserPreferences
): Promise<string> {
  const prediction = calculateFootballPrediction(data, prefs);
  const localSummary = formatPredictionSummary(data, prediction);
  const prompt = buildPrompt(data, prefs, prediction);
  const provider = preferredProvider();

  if (provider === "local") return localSummary;

  try {
    if (provider === "openai") {
      return await callOpenAI(prompt);
    }
    if (provider === "anthropic") {
      return await callAnthropic(prompt);
    }
    return await callMinimax(prompt);
  } catch (error) {
    const message = error instanceof Error ? error.message : "大模型调用失败";
    console.error("[analysis] LLM enhancement failed:", message);
    return `${localSummary}\n\n大模型增强暂不可用，当前结果来自本地数学模型。原因：${message}`;
  }
}
