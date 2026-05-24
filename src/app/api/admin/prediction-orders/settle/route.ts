import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "@/lib/admin-auth";
import { getFixtureById } from "@/lib/football-api";
import { createServiceRoleClient } from "@/lib/supabase";

type PendingItem = {
  id: string;
  order_id: string;
  fixture_id: number;
  market: string;
  direction: string;
  result_status: "pending" | "won" | "lost" | "push" | "void";
};

type FixtureResponseItem = {
  fixture?: { status?: { short?: string } };
  goals?: { home?: number | null; away?: number | null };
};

type SettledStatus = "won" | "lost" | "push" | "void" | "pending";

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return fallback;
}

function isFinished(short?: string) {
  return ["FT", "AET", "PEN"].includes(short ?? "");
}

function parseFixtureResult(data: unknown) {
  const response = (data as { response?: unknown[] } | null)?.response;
  const fixture = Array.isArray(response) ? (response[0] as FixtureResponseItem | undefined) : undefined;
  const home = fixture?.goals?.home;
  const away = fixture?.goals?.away;

  if (!isFinished(fixture?.fixture?.status?.short)) return null;
  if (typeof home !== "number" || typeof away !== "number") return null;

  return { home, away, finalScore: `${home}-${away}` };
}

function settleByMarket(item: PendingItem, home: number, away: number): SettledStatus {
  const totalGoals = home + away;
  const homeWon = home > away;
  const awayWon = away > home;
  const draw = home === away;
  const direction = item.direction;

  if (item.market === "胜平负") {
    if (direction.includes("主胜")) return homeWon ? "won" : "lost";
    if (direction.includes("客胜")) return awayWon ? "won" : "lost";
    if (direction.includes("平局")) return draw ? "won" : "lost";
  }

  if (item.market === "大小球") {
    if (direction.includes("大 2.5")) return totalGoals > 2.5 ? "won" : "lost";
    if (direction.includes("小 2.5")) return totalGoals < 2.5 ? "won" : "lost";
  }

  if (item.market === "双方进球") {
    const bothScored = home > 0 && away > 0;
    if (direction.includes("双方进球")) return bothScored ? "won" : "lost";
    if (direction.includes("双方不进球")) return bothScored ? "lost" : "won";
  }

  if (item.market === "双重机会") {
    if (direction.includes("主队不败")) return homeWon || draw ? "won" : "lost";
    if (direction.includes("客队不败")) return awayWon || draw ? "won" : "lost";
    if (direction.includes("分胜负")) return draw ? "lost" : "won";
  }

  if (item.market === "平局退款") {
    if (draw) return "push";
    if (direction.includes("主队")) return homeWon ? "won" : "lost";
    if (direction.includes("客队")) return awayWon ? "won" : "lost";
  }

  if (item.market === "比分") {
    const scoreMatch = direction.match(/(\d+)\s*-\s*(\d+)/);
    if (!scoreMatch) return "void";
    return Number(scoreMatch[1]) === home && Number(scoreMatch[2]) === away ? "won" : "lost";
  }

  return "void";
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) return unauthorized();

  let limit = 50;
  try {
    const body = (await req.json().catch(() => ({}))) as { limit?: unknown };
    limit = Math.max(1, Math.min(100, Math.round(Number(body.limit ?? 50) || 50)));
  } catch {
    limit = 50;
  }

  try {
    const supabase = createServiceRoleClient();
    const { data: pendingItems, error: readError } = await supabase
      .from("prediction_order_items")
      .select("id, order_id, fixture_id, market, direction, result_status")
      .eq("result_status", "pending")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (readError) throw readError;

    const now = new Date().toISOString();
    const settled: Array<{ itemId: string; orderId: string; status: SettledStatus; finalScore: string }> = [];
    const skipped: Array<{ itemId: string; reason: string }> = [];

    for (const item of (pendingItems ?? []) as PendingItem[]) {
      try {
        const fixture = await getFixtureById(Number(item.fixture_id));
        const result = parseFixtureResult(fixture);
        if (!result) {
          skipped.push({ itemId: item.id, reason: "比赛未完场或暂未返回比分" });
          continue;
        }

        const status = settleByMarket(item, result.home, result.away);
        if (status === "pending") {
          skipped.push({ itemId: item.id, reason: "暂无法判断该玩法" });
          continue;
        }

        const { error: updateError } = await supabase
          .from("prediction_order_items")
          .update({
            result_status: status,
            final_score: result.finalScore,
            settled_at: now,
            updated_at: now,
          })
          .eq("id", item.id);

        if (updateError) throw updateError;
        settled.push({ itemId: item.id, orderId: item.order_id, status, finalScore: result.finalScore });
      } catch (itemError) {
        skipped.push({ itemId: item.id, reason: errorMessage(itemError, "结算失败") });
      }
    }

    const touchedOrderIds = Array.from(new Set(settled.map((item) => item.orderId)));
    for (const orderId of touchedOrderIds) {
      const { count, error: countError } = await supabase
        .from("prediction_order_items")
        .select("id", { count: "exact", head: true })
        .eq("order_id", orderId)
        .eq("result_status", "pending");

      if (countError) throw countError;
      if ((count ?? 0) === 0) {
        const { error: orderError } = await supabase
          .from("prediction_orders")
          .update({ status: "settled", settled_at: now, updated_at: now })
          .eq("id", orderId);
        if (orderError) throw orderError;
      }
    }

    return NextResponse.json({
      ok: true,
      checked: pendingItems?.length ?? 0,
      settled: settled.length,
      skipped: skipped.length,
      settledItems: settled,
      skippedItems: skipped,
    });
  } catch (error) {
    const message = errorMessage(error, "结算预测记录失败");
    console.error("[prediction orders settle] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
