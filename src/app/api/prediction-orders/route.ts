import { NextRequest, NextResponse } from "next/server";
import { PREDICTION_CREDITS_PER_MATCH } from "@/lib/membership";
import {
  PredictionOrder,
  PredictionOrderInput,
  PredictionOrderItem,
} from "@/lib/prediction-orders";
import { buildServerPredictionOrderInput } from "@/lib/server-predictions";
import { createServerClient, createServiceRoleClient } from "@/lib/supabase";
import { UserPreferences } from "@/lib/football-prediction";

type PredictionOrderRow = {
  id: string;
  status: PredictionOrder["status"];
  model_version: string;
  risk_level: string;
  cost: number;
  credits_before: number;
  credits_after: number;
  prediction_count: number;
  selected_count: number;
  total_suggested_percent: number;
  summary: string | null;
  created_at: string;
  settled_at: string | null;
};

type PredictionOrderItemRow = {
  id: string;
  order_id: string;
  fixture_id: string;
  league: string;
  home_team: string;
  away_team: string;
  kickoff_at: string | null;
  status_at_prediction: string;
  market: string;
  direction: string;
  recommendation: string;
  confidence: number;
  score: number;
  grade: string;
  risk_label: string;
  suggested_percent: number;
  fair_odds: number;
  offered_odds: number | null;
  value_edge: number | null;
  odds_label: string | null;
  value_label: string | null;
  reason: string | null;
  data_basis: unknown;
  result_status: PredictionOrderItem["resultStatus"];
  final_score: string | null;
  settled_at: string | null;
};

type CreatePredictionOrderRpcRow = {
  order_id: string;
  credits_before: number;
  credits_after: number;
};

function authToken(req: NextRequest) {
  return req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
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

async function currentUser(req: NextRequest) {
  const token = authToken(req);
  if (!token) return { user: null, error: "请先登录后再使用预测记录" };

  const authClient = createServerClient();
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return { user: null, error: "登录已过期，请重新登录" };

  return { user: data.user, error: null };
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapItem(row: PredictionOrderItemRow): PredictionOrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    fixtureId: row.fixture_id,
    league: row.league,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    kickoffAt: row.kickoff_at,
    statusAtPrediction: row.status_at_prediction,
    market: row.market,
    direction: row.direction,
    recommendation: row.recommendation,
    confidence: Number(row.confidence),
    score: Number(row.score),
    grade: row.grade,
    riskLabel: row.risk_label,
    suggestedPercent: Number(row.suggested_percent),
    fairOdds: Number(row.fair_odds),
    offeredOdds: row.offered_odds == null ? null : Number(row.offered_odds),
    valueEdge: row.value_edge == null ? null : Number(row.value_edge),
    oddsLabel: row.odds_label ?? "",
    valueLabel: row.value_label ?? "",
    reason: row.reason ?? "",
    dataBasis: Array.isArray(row.data_basis) ? row.data_basis.map(String) : [],
    resultStatus: row.result_status,
    finalScore: row.final_score,
    settledAt: row.settled_at,
  };
}

function normalizeRiskLevel(value: unknown): UserPreferences["risk_level"] {
  return value === "conservative" || value === "balanced" || value === "aggressive"
    ? value
    : "balanced";
}

function normalizeStringList(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

function extractFixtureIds(body: PredictionOrderInput) {
  const fixtureIds = Array.isArray(body.fixtureIds) ? body.fixtureIds : [];
  const itemIds = Array.isArray(body.items) ? body.items.map((item) => item.fixtureId) : [];
  return (fixtureIds.length > 0 ? fixtureIds : itemIds).slice(0, 20);
}

function mapOrder(row: PredictionOrderRow, items: PredictionOrderItem[]): PredictionOrder {
  return {
    id: row.id,
    status: row.status,
    modelVersion: row.model_version,
    riskLevel: row.risk_level,
    cost: Number(row.cost),
    creditsBefore: Number(row.credits_before),
    creditsAfter: Number(row.credits_after),
    predictionCount: Number(row.prediction_count),
    selectedCount: Number(row.selected_count),
    totalSuggestedPercent: Number(row.total_suggested_percent),
    summary: row.summary ?? "预测池推荐",
    createdAt: row.created_at,
    settledAt: row.settled_at,
    items,
  };
}

export async function GET(req: NextRequest) {
  const { user, error } = await currentUser(req);
  if (error || !user) return NextResponse.json({ orders: [], error }, { status: 401 });

  try {
    const supabase = createServiceRoleClient();
    const { data: orders, error: ordersError } = await supabase
      .from("prediction_orders")
      .select(
        "id, status, model_version, risk_level, cost, credits_before, credits_after, prediction_count, selected_count, total_suggested_percent, summary, created_at, settled_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (ordersError) throw ordersError;
    const orderIds = (orders ?? []).map((order) => order.id);

    let itemsByOrder = new Map<string, PredictionOrderItem[]>();
    if (orderIds.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from("prediction_order_items")
        .select(
          "id, order_id, fixture_id, league, home_team, away_team, kickoff_at, status_at_prediction, market, direction, recommendation, confidence, score, grade, risk_label, suggested_percent, fair_odds, offered_odds, value_edge, odds_label, value_label, reason, data_basis, result_status, final_score, settled_at"
        )
        .in("order_id", orderIds)
        .order("created_at", { ascending: true });

      if (itemsError) throw itemsError;
      itemsByOrder = (items ?? []).reduce((map, row) => {
        const mapped = mapItem(row as PredictionOrderItemRow);
        const current = map.get(mapped.orderId) ?? [];
        current.push(mapped);
        map.set(mapped.orderId, current);
        return map;
      }, new Map<string, PredictionOrderItem[]>());
    }

    return NextResponse.json({
      orders: (orders ?? []).map((order) =>
        mapOrder(order as PredictionOrderRow, itemsByOrder.get(order.id) ?? [])
      ),
    });
  } catch (err) {
    const message = errorMessage(err, "读取历史预测失败");
    if (predictionTablesMissing(message)) {
      return NextResponse.json({
        orders: [],
        setupRequired: true,
        error: "预测记录表还没建好，请先在 Supabase 执行更新后的 SQL",
      });
    }
    console.error("[prediction orders] read failed:", message);
    return NextResponse.json({ orders: [], error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, error } = await currentUser(req);
  if (error || !user) return NextResponse.json({ error }, { status: 401 });

  let clientBody: PredictionOrderInput;
  try {
    clientBody = (await req.json()) as PredictionOrderInput;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const fixtureIds = extractFixtureIds(clientBody);
  if (fixtureIds.length === 0) {
    return NextResponse.json({ error: "请先把比赛加入预测池" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  try {
    const { data: prefsRow, error: prefsError } = await supabase
      .from("user_preferences")
      .select("risk_level, capital, preferred_markets, preferred_models")
      .eq("user_id", user.id)
      .maybeSingle();

    if (prefsError) throw prefsError;

    const prefs: UserPreferences = {
      risk_level: normalizeRiskLevel(prefsRow?.risk_level),
      capital: Math.max(1, Math.round(safeNumber(prefsRow?.capital, 1000))),
      preferred_markets: normalizeStringList(prefsRow?.preferred_markets),
      preferred_models: normalizeStringList(prefsRow?.preferred_models),
    };

    const body = await buildServerPredictionOrderInput({
      fixtureIds,
      prefs,
      riskLevel: String(clientBody.riskLevel || prefs.risk_level),
      summary: String(clientBody.summary || `预测池 ${fixtureIds.length} 场`),
      preferencesSnapshot: {
        riskLevel: prefs.risk_level,
        preferredModels: prefs.preferred_models,
        preferredMarkets: prefs.preferred_markets,
      },
      portfolioSnapshot: {
        ...(clientBody.portfolioSnapshot &&
        typeof clientBody.portfolioSnapshot === "object"
          ? clientBody.portfolioSnapshot
          : {}),
        serverGeneratedAt: new Date().toISOString(),
        source: "server-live-prediction",
      },
    });

    const rpcItems = body.items.map((item) => ({
      fixture_id: String(item.fixtureId),
      league: item.league,
      home_team: item.homeTeam,
      away_team: item.awayTeam,
      kickoff_at: item.kickoffAt,
      status_at_prediction: item.statusAtPrediction,
      market: item.market,
      direction: item.direction,
      recommendation: item.recommendation,
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
      reason: item.reason,
      data_basis: item.dataBasis,
    }));

    const { data, error: rpcError } = await supabase.rpc("create_prediction_order", {
      p_user_id: user.id,
      p_email: user.email ?? "",
      p_model_version: body.modelVersion,
      p_risk_level: body.riskLevel,
      p_cost: body.cost,
      p_prediction_count: body.predictionCount,
      p_selected_count: body.selectedCount,
      p_total_suggested_percent: body.totalSuggestedPercent,
      p_summary: body.summary,
      p_preferences_snapshot: body.preferencesSnapshot,
      p_portfolio_snapshot: body.portfolioSnapshot,
      p_items: rpcItems,
    });

    if (rpcError) throw rpcError;

    const result = (Array.isArray(data) ? data[0] : data) as
      | CreatePredictionOrderRpcRow
      | undefined;
    return NextResponse.json({
      ok: true,
      orderId: result?.order_id,
      credits: Math.max(0, Math.round(Number(result?.credits_after ?? 0))),
      items: body.items,
    });
  } catch (err) {
    const message = errorMessage(err, "保存预测记录失败");
    if (message.includes("INSUFFICIENT_CREDITS")) {
      return NextResponse.json(
        {
          error: `预测积分不足：本次需要 ${fixtureIds.length * PREDICTION_CREDITS_PER_MATCH} 分。`,
          cost: fixtureIds.length * PREDICTION_CREDITS_PER_MATCH,
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
    console.error("[prediction orders] create failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
