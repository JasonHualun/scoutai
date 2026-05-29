import { NextRequest, NextResponse } from "next/server";
import { PREDICTION_CREDITS_PER_MATCH } from "@/lib/membership";
import {
  PREDICTION_MODEL_VERSION,
  PredictionOrder,
  PredictionOrderInput,
  PredictionOrderItem,
} from "@/lib/prediction-orders";
import { createServerClient, createServiceRoleClient } from "@/lib/supabase";

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
  fixture_id: number;
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

function normalizeBody(body: PredictionOrderInput): PredictionOrderInput {
  const items = Array.isArray(body.items) ? body.items.slice(0, 20) : [];
  const predictionCount = items.length;

  return {
    cost: predictionCount * PREDICTION_CREDITS_PER_MATCH,
    modelVersion: String(body.modelVersion || PREDICTION_MODEL_VERSION),
    riskLevel: String(body.riskLevel || "balanced"),
    summary: String(body.summary || "预测池推荐"),
    predictionCount,
    selectedCount: Math.max(0, Math.min(predictionCount, Math.round(safeNumber(body.selectedCount)))),
    totalSuggestedPercent: Math.max(0, safeNumber(body.totalSuggestedPercent)),
    preferencesSnapshot:
      body.preferencesSnapshot && typeof body.preferencesSnapshot === "object"
        ? body.preferencesSnapshot
        : {},
    portfolioSnapshot:
      body.portfolioSnapshot && typeof body.portfolioSnapshot === "object"
        ? body.portfolioSnapshot
        : {},
    items: items.map((item) => ({
      fixtureId: Math.max(0, Math.round(safeNumber(item.fixtureId))),
      league: String(item.league || "未知联赛"),
      homeTeam: String(item.homeTeam || "主队"),
      awayTeam: String(item.awayTeam || "客队"),
      kickoffAt: item.kickoffAt ? String(item.kickoffAt) : null,
      statusAtPrediction: String(item.statusAtPrediction || "unknown"),
      market: String(item.market || "观察"),
      direction: String(item.direction || "观察"),
      recommendation: String(item.recommendation || "observe"),
      confidence: Math.max(0, Math.min(100, Math.round(safeNumber(item.confidence)))),
      score: Math.max(0, Math.min(100, Math.round(safeNumber(item.score)))),
      grade: String(item.grade || "C"),
      riskLabel: String(item.riskLabel || "待确认"),
      suggestedPercent: Math.max(0, safeNumber(item.suggestedPercent)),
      fairOdds: Math.max(0, safeNumber(item.fairOdds)),
      offeredOdds: item.offeredOdds == null ? null : Math.max(0, safeNumber(item.offeredOdds)),
      valueEdge: item.valueEdge == null ? null : safeNumber(item.valueEdge),
      oddsLabel: String(item.oddsLabel || "待市场确认"),
      valueLabel: String(item.valueLabel || "待市场确认"),
      reason: String(item.reason || "等待更多数据确认。"),
      dataBasis: Array.isArray(item.dataBasis) ? item.dataBasis.map(String) : [],
    })),
  };
}

function mapItem(row: PredictionOrderItemRow): PredictionOrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    fixtureId: Number(row.fixture_id),
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

  let body: PredictionOrderInput;
  try {
    body = normalizeBody((await req.json()) as PredictionOrderInput);
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  if (body.items.length === 0 || body.predictionCount === 0) {
    return NextResponse.json({ error: "请先把比赛加入预测池" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  try {
    const rpcItems = body.items.map((item) => ({
      fixture_id: item.fixtureId,
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
    });
  } catch (err) {
    const message = errorMessage(err, "保存预测记录失败");
    if (message.includes("INSUFFICIENT_CREDITS")) {
      return NextResponse.json(
        { error: `预测积分不足：本次需要 ${body.cost} 分。`, cost: body.cost },
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
