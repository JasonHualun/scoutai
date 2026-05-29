import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "@/lib/admin-auth";
import { PRO_TRIAL_CREDITS, addMonths, creditPlanByAmount } from "@/lib/membership";
import { createServiceRoleClient } from "@/lib/supabase";
import { findAuthUserByEmail } from "@/lib/supabase-admin-users";

type OpenMembershipBody = {
  email?: string;
  months?: number;
  applicationId?: string;
  action?: "confirm" | "reject";
};

function safeMonths(value: unknown) {
  return Math.max(1, Math.min(24, Number(value) || 1));
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return fallback;
}

function paymentApplicationTableMissing(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("payment_applications") &&
    (lower.includes("does not exist") || lower.includes("schema cache") || lower.includes("relation"))
  );
}

function missingCreditsColumn(message: string) {
  const lower = message.toLowerCase();
  return lower.includes("prediction_credits") && (lower.includes("column") || lower.includes("schema cache"));
}

function creditsFromApplication(amount: unknown) {
  return creditPlanByAmount(Number(amount))?.credits ?? null;
}

async function openProForEmail(
  supabase: ReturnType<typeof createServiceRoleClient>,
  email: string,
  months: number,
  creditsToAdd = PRO_TRIAL_CREDITS
) {
  const user = await findAuthUserByEmail(supabase, email);
  if (!user) {
    return { error: "没有找到这个注册邮箱", status: 404 as const };
  }

  let creditsSupported = true;
  let current: { pro_until?: string | null; prediction_credits?: number | null } | null = null;
  const { data: currentWithCredits, error: currentError } = await supabase
    .from("memberships")
    .select("pro_until, prediction_credits")
    .eq("user_id", user.id)
    .maybeSingle();

  if (currentError) {
    if (!missingCreditsColumn(currentError.message)) throw currentError;
    creditsSupported = false;
    const { data: currentWithoutCredits, error: fallbackError } = await supabase
      .from("memberships")
      .select("pro_until")
      .eq("user_id", user.id)
      .maybeSingle();

    if (fallbackError) throw fallbackError;
    current = currentWithoutCredits;
  } else {
    current = currentWithCredits;
  }

  const currentEnd = current?.pro_until ? new Date(current.pro_until) : new Date();
  const base = currentEnd.getTime() > Date.now() ? currentEnd : new Date();
  const proUntil = addMonths(base, months).toISOString();
  const nextCredits = Math.max(0, Math.round(Number(current?.prediction_credits ?? 0))) + creditsToAdd;

  const payload: {
    user_id: string;
    email: string;
    plan: "pro";
    pro_until: string;
    updated_at: string;
    prediction_credits?: number;
  } = {
    user_id: user.id,
    email,
    plan: "pro",
    pro_until: proUntil,
    updated_at: new Date().toISOString(),
  };

  if (creditsSupported) payload.prediction_credits = nextCredits;

  const { error: upsertError } = await supabase
    .from("memberships")
    .upsert(payload, { onConflict: "user_id" });

  if (upsertError) throw upsertError;

  return {
    membership: {
      email,
      plan: "pro",
      proUntil,
      predictionCredits: creditsSupported ? nextCredits : undefined,
    },
  };
}

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return unauthorized();

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("payment_applications")
      .select("id, order_no, email, amount, currency, months, status, note, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    return NextResponse.json({ applications: data ?? [] });
  } catch (error) {
    const message = errorMessage(error, "读取付款申请失败");
    if (paymentApplicationTableMissing(message)) {
      return NextResponse.json({
        applications: [],
        setupRequired: true,
        error: "需要先在 Supabase 执行更新后的 supabase/memberships.sql",
      });
    }
    console.error("[admin memberships] list applications failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) return unauthorized();

  let body: OpenMembershipBody;
  try {
    body = (await req.json()) as OpenMembershipBody;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();

    if (body.applicationId) {
      const { data: application, error: appError } = await supabase
        .from("payment_applications")
        .select("id, email, amount, months, status, note")
        .eq("id", body.applicationId)
        .single();

      if (appError) throw appError;
      if (!application) {
        return NextResponse.json({ error: "没有找到这笔付款申请" }, { status: 404 });
      }

      if (body.action === "reject") {
        const { error: rejectError } = await supabase
          .from("payment_applications")
          .update({
            status: "rejected",
            updated_at: new Date().toISOString(),
            confirmed_by: "admin",
          })
          .eq("id", body.applicationId);

        if (rejectError) throw rejectError;
        return NextResponse.json({ ok: true, application: { id: body.applicationId, status: "rejected" } });
      }

      if (application.status !== "pending") {
        return NextResponse.json({ error: "这笔申请已经处理过了" }, { status: 409 });
      }

      const creditsToAdd = creditsFromApplication(application.amount);
      if (creditsToAdd == null) {
        return NextResponse.json({ error: "付款金额和套餐不匹配，请拒绝后让用户重新提交" }, { status: 400 });
      }

      const result = await openProForEmail(
        supabase,
        String(application.email).trim().toLowerCase(),
        1,
        creditsToAdd
      );

      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      const { error: updateError } = await supabase
        .from("payment_applications")
        .update({
          status: "confirmed",
          updated_at: new Date().toISOString(),
          confirmed_at: new Date().toISOString(),
          confirmed_by: "admin",
        })
        .eq("id", body.applicationId);

      if (updateError) throw updateError;

      return NextResponse.json({
        ok: true,
        membership: result.membership,
        application: { id: body.applicationId, status: "confirmed" },
      });
    }

    const email = body.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "请输入有效邮箱" }, { status: 400 });
    }

    const result = await openProForEmail(supabase, email, safeMonths(body.months));
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      ok: true,
      membership: result.membership,
    });
  } catch (error) {
    const message = errorMessage(error, "开通失败");
    console.error("[admin memberships] open pro failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
