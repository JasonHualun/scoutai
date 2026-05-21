import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceRoleClient } from "@/lib/supabase";
import { PRO_RENEWAL_PRICE_CNY, PRO_TRIAL_PRICE_CNY } from "@/lib/membership";

type PaymentApplicationBody = {
  orderNo?: string;
  months?: number;
  note?: string;
};

const ORDER_PATTERN = /^PRO-\d{8}-[A-Z0-9]{4,10}$/;

function authToken(req: NextRequest) {
  return req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
}

function makeOrderNo() {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PRO-${date}-${random}`;
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

async function currentUser(req: NextRequest) {
  const token = authToken(req);
  if (!token) return { user: null, error: "请先登录后再提交付款申请" };

  const authClient = createServerClient();
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return { user: null, error: "登录已过期，请重新登录" };

  return { user: data.user, error: null };
}

export async function GET(req: NextRequest) {
  const { user, error } = await currentUser(req);
  if (error || !user) {
    return NextResponse.json({ error }, { status: 401 });
  }

  try {
    const supabase = createServiceRoleClient();
    const { data, error: listError } = await supabase
      .from("payment_applications")
      .select("id, order_no, email, amount, currency, months, status, note, created_at, confirmed_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (listError) throw listError;
    return NextResponse.json({ applications: data ?? [] });
  } catch (err) {
    const message = errorMessage(err, "读取付款申请失败");
    if (paymentApplicationTableMissing(message)) {
      return NextResponse.json({ applications: [], setupRequired: true });
    }
    console.error("[payment applications] list failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, error } = await currentUser(req);
  if (error || !user) {
    return NextResponse.json({ error }, { status: 401 });
  }

  let body: PaymentApplicationBody = {};
  try {
    body = (await req.json()) as PaymentApplicationBody;
  } catch {
    body = {};
  }

  const months = Math.max(1, Math.min(24, Number(body.months) || 1));
  const submittedOrderNo = body.orderNo?.trim().toUpperCase();
  const orderNo = submittedOrderNo && ORDER_PATTERN.test(submittedOrderNo) ? submittedOrderNo : makeOrderNo();

  try {
    const supabase = createServiceRoleClient();
    const { data, error: insertError } = await supabase
      .from("payment_applications")
      .insert({
        order_no: orderNo,
        user_id: user.id,
        email: user.email ?? "",
        amount: months === 1 ? 39.9 : 39.9 + 99.9 * (months - 1),
        currency: "CNY",
        months,
        status: "pending",
        note: body.note?.slice(0, 300) ?? null,
      })
      .select("id, order_no, email, amount, currency, months, status, created_at")
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({
      ok: true,
      application: data,
      message: `首月 ${PRO_TRIAL_PRICE_CNY}，续费 ${PRO_RENEWAL_PRICE_CNY} 的付款申请已提交，管理员会人工核对到账。`,
    });
  } catch (err) {
    const message = errorMessage(err, "提交付款申请失败");
    if (paymentApplicationTableMissing(message)) {
      return NextResponse.json(
        { error: "付款申请表还没建好，请管理员先在 Supabase 执行更新后的 SQL" },
        { status: 503 }
      );
    }
    const status = message.toLowerCase().includes("duplicate") ? 409 : 500;
    console.error("[payment applications] create failed:", message);
    return NextResponse.json({ error: message }, { status });
  }
}
