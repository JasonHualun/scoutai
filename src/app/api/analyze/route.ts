import { NextRequest, NextResponse } from "next/server";
import { UserPreferences } from "@/lib/football-prediction";
import { normalizeMembership, PREDICTION_CREDITS_PER_MATCH } from "@/lib/membership";
import { analyzeWithMinimax } from "@/lib/minimax";
import { buildServerPredictionOrderInput } from "@/lib/server-predictions";
import { translateLeague, translateTeam, translateTeamText } from "@/lib/league-translations";
import { createServerClient, createServiceRoleClient } from "@/lib/supabase";

type AnalyzeBody = {
  fixtureId?: string | number;
};

type CreatePredictionOrderRpcRow = {
  order_id: string;
  credits_before: number;
  credits_after: number;
};

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRiskLevel(value: unknown): UserPreferences["risk_level"] {
  return value === "conservative" || value === "balanced" || value === "aggressive"
    ? value
    : "balanced";
}

function normalizeStringList(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return fallback;
}

function predictionTablesMissing(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("create_prediction_order") ||
    ((lower.includes("prediction_orders") || lower.includes("prediction_order_items")) &&
      (lower.includes("does not exist") ||
        lower.includes("schema cache") ||
        lower.includes("relation") ||
        lower.includes("table") ||
        lower.includes("function")))
  );
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const supabase = createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as AnalyzeBody;
    const fixtureId = body.fixtureId;
    if (fixtureId == null || String(fixtureId).trim() === "") {
      return NextResponse.json(
        { error: "请从比赛详情页重新发起分析，系统需要服务端比赛 ID" },
        { status: 400 }
      );
    }

    const serviceSupabase = createServiceRoleClient();
    const { data: membership, error: membershipError } = await serviceSupabase
      .from("memberships")
      .select("plan, pro_until, prediction_credits")
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) throw membershipError;

    const normalizedMembership = normalizeMembership(membership, user);
    if (normalizedMembership.plan !== "pro") {
      return NextResponse.json(
        { error: "Pro 高级版用户可使用深度分析" },
        { status: 402 }
      );
    }

    const currentCredits = Math.max(0, Math.round(Number(membership?.prediction_credits ?? 0)));
    if (currentCredits < PREDICTION_CREDITS_PER_MATCH) {
      return NextResponse.json(
        {
          error: `预测积分不足：本次需要 ${PREDICTION_CREDITS_PER_MATCH} 分。`,
          cost: PREDICTION_CREDITS_PER_MATCH,
          credits: currentCredits,
        },
        { status: 402 }
      );
    }

    const { data: prefsRow, error: prefsError } = await serviceSupabase
      .from("user_preferences")
      .select("risk_level, capital, preferred_markets, preferred_models")
      .eq("user_id", user.id)
      .maybeSingle();

    if (prefsError) throw prefsError;

    const userPrefs: UserPreferences = {
      risk_level: normalizeRiskLevel(prefsRow?.risk_level),
      capital: Math.max(1, Math.round(safeNumber(prefsRow?.capital, 1000))),
      preferred_markets: normalizeStringList(prefsRow?.preferred_markets),
      preferred_models: normalizeStringList(prefsRow?.preferred_models),
    };

    const builtOrder = await buildServerPredictionOrderInput({
      fixtureIds: [fixtureId],
      prefs: userPrefs,
      summary: "单场深度分析",
      preferencesSnapshot: {
        riskLevel: userPrefs.risk_level,
        preferredModels: userPrefs.preferred_models,
        preferredMarkets: userPrefs.preferred_markets,
      },
      portfolioSnapshot: {
        mode: "single-analysis",
        serverGeneratedAt: new Date().toISOString(),
      },
    });

    const builtMatch = builtOrder.builtMatches[0];
    const analysis = await analyzeWithMinimax(builtMatch.matchData, userPrefs);
    const rpcItems = builtOrder.items.map((item) => ({
      fixture_id: String(item.fixtureId),
      league: translateLeague(item.league),
      home_team: translateTeam(item.homeTeam),
      away_team: translateTeam(item.awayTeam),
      kickoff_at: item.kickoffAt,
      status_at_prediction: item.statusAtPrediction,
      market: item.market,
      direction: translateTeamText(item.direction),
      recommendation: translateTeamText(item.recommendation),
      confidence: item.confidence,
      score: item.score,
      grade: item.grade,
      risk_label: item.riskLabel,
      suggested_percent: item.suggestedPercent,
      fair_odds: item.fairOdds,
      offered_odds: item.offeredOdds,
      value_edge: item.valueEdge,
      odds_label: item.oddsLabel,
      value_label: item.valueLabel,
      reason: translateTeamText(item.reason),
      data_basis: item.dataBasis,
    }));

    const { data, error: rpcError } = await serviceSupabase.rpc("create_prediction_order", {
      p_user_id: user.id,
      p_email: user.email ?? "",
      p_model_version: builtOrder.modelVersion,
      p_risk_level: builtOrder.riskLevel,
      p_cost: builtOrder.cost,
      p_prediction_count: builtOrder.predictionCount,
      p_selected_count: builtOrder.selectedCount,
      p_total_suggested_percent: builtOrder.totalSuggestedPercent,
      p_summary: builtOrder.summary,
      p_preferences_snapshot: builtOrder.preferencesSnapshot,
      p_portfolio_snapshot: {
        ...builtOrder.portfolioSnapshot,
        aiAnalysis: analysis,
      },
      p_items: rpcItems,
    });

    if (rpcError) throw rpcError;

    const result = (Array.isArray(data) ? data[0] : data) as
      | CreatePredictionOrderRpcRow
      | undefined;

    return NextResponse.json({
      analysis,
      prediction: builtMatch.prediction,
      orderId: result?.order_id,
      credits: Math.max(0, Math.round(Number(result?.credits_after ?? 0))),
    });
  } catch (error: unknown) {
    const message = errorMessage(error, "分析失败");
    if (message.includes("INSUFFICIENT_CREDITS")) {
      return NextResponse.json(
        {
          error: `预测积分不足：本次需要 ${PREDICTION_CREDITS_PER_MATCH} 分。`,
          cost: PREDICTION_CREDITS_PER_MATCH,
        },
        { status: 402 }
      );
    }
    if (predictionTablesMissing(message)) {
      return NextResponse.json(
        {
          error: "预测记录表还没建好，请先在 Supabase 执行更新后的 SQL。本次没有扣积分。",
          setupRequired: true,
        },
        { status: 503 }
      );
    }
    console.error("[analyze] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
