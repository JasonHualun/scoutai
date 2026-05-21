import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceRoleClient } from "@/lib/supabase";

type DeductCreditsBody = {
  cost?: number;
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

function missingCreditsColumn(message: string) {
  const lower = message.toLowerCase();
  return lower.includes("prediction_credits") && (lower.includes("column") || lower.includes("schema cache"));
}

async function currentUser(req: NextRequest) {
  const token = authToken(req);
  if (!token) return { user: null, error: "请先登录后再使用预测积分" };

  const authClient = createServerClient();
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return { user: null, error: "登录已过期，请重新登录" };

  return { user: data.user, error: null };
}

export async function POST(req: NextRequest) {
  const { user, error } = await currentUser(req);
  if (error || !user) return NextResponse.json({ error }, { status: 401 });

  let body: DeductCreditsBody = {};
  try {
    body = (await req.json()) as DeductCreditsBody;
  } catch {
    body = {};
  }

  const cost = Math.max(1, Math.round(Number(body.cost) || 0));

  try {
    const supabase = createServiceRoleClient();
    const { data: current, error: readError } = await supabase
      .from("memberships")
      .select("prediction_credits")
      .eq("user_id", user.id)
      .maybeSingle();

    if (readError) throw readError;

    const currentCredits = Math.max(0, Math.round(Number(current?.prediction_credits ?? 0)));
    if (currentCredits < cost) {
      return NextResponse.json(
        { error: `预测积分不足：本次需要 ${cost} 分，当前剩余 ${currentCredits} 分。`, credits: currentCredits },
        { status: 402 }
      );
    }

    const nextCredits = currentCredits - cost;
    const { error: updateError } = await supabase
      .from("memberships")
      .update({ prediction_credits: nextCredits, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, credits: nextCredits });
  } catch (err) {
    const message = errorMessage(err, "扣除预测积分失败");
    if (missingCreditsColumn(message)) {
      return NextResponse.json(
        { error: "预测积分字段还没建好，请先在 Supabase 执行更新后的 SQL", setupRequired: true },
        { status: 503 }
      );
    }
    console.error("[prediction credits] deduct failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
