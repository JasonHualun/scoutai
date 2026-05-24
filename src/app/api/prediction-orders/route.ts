import { NextRequest, NextResponse } from "next/server";
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
  data_basis: string[] | null;
  result_status: PredictionOrderItem["resultStatus"];
  final_score: string | null;
  settled_at: string | null;
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
    (lower.includes("prediction_orders") || lower.includes("prediction_order_items")) &&
    (lower.includes("does not exist") ||
      lower.includes("schema cache") ||
      lower.includes("relation") ||
      lower.includes("table"))
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
  return {
    cost: Math.max(1, Math.round(safeNumber(body.cost))),
    modelVersion: String(body.modelVersion || PREDICTION_MODEL_VERSION),
    riskLevel: String(body.riskLevel || "balanced"),
    summary: String(body.summary || "预测池推荐"),
    predictionCount: Math.max(0, Math.round(safeNumber(body.predictionCount, items.length))),
    selectedCount: Math.max(0, Math.round(safeNumber(body.selectedCount))),
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
      oddsLabel: String(item.oddsLabel || "待盘口确认"),
      valueLabel: String(item.valueLabel || "待盘口确认"),
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
    dataBasis: Array.isArray(row.data_basis) ? row.data_basis : [],
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
  let insertedOrderId: string | null = null;

  try {
    const { data: current, error: readError } = await supabase
      .from("memberships")
      .select("prediction_credits")
      .eq("user_id", user.id)
      .maybeSingle();

    if (readError) throw readError;

    const currentCredits = Math.max(0, Math.round(Number(current?.prediction_credits ?? 0)));
    if (currentCredits < body.cost) {
      return NextResponse.json(
        { error: `预测积分不足：本次需要 ${body.cost} 分，当前剩余 ${currentCredits} 分。`, credits: currentCredits },
        { status: 402 }
      );
    }

    const nextCredits = currentCredits - body.cost;
    const { data: order, error: orderError } = await supabase
      .from("prediction_orders")
      .insert({
        user_id: user.id,
        email: user.email ?? "",
        status: "generated",
        model_version: body.modelVersion,
        risk_level: body.riskLevel,
        cost: body.cost,
        credits_before: currentCredits,
        credits_after: nextCredits,
        prediction_count: body.predictionCount,
        selected_count: body.selectedCount,
        total_suggested_percent: body.totalSuggestedPercent,
        summary: body.summary,
        preferences_snapshot: body.preferencesSnapshot,
        portfolio_snapshot: body.portfolioSnapshot,
      })
      .select("id")
      .single();

    if (orderError) throw orderError;
    insertedOrderId = order.id;

    const { error: itemError } = await supabase.from("prediction_order_items").insert(
      body.items.map((item) => ({
        order_id: order.id,
        user_id: user.id,
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
      }))
    );

    if (itemError) throw itemError;

    const { error: updateError } = await supabase
      .from("memberships")
      .update({ prediction_credits: nextCredits, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, orderId: order.id, credits: nextCredits });
  } catch (err) {
    if (insertedOrderId) {
      await supabase.from("prediction_orders").delete().eq("id", insertedOrderId);
    }

    const message = errorMessage(err, "保存预测记录失败");
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
