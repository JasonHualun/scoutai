import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { findAuthUserByEmail } from "@/lib/supabase-admin-users";

type ResetPasswordBody = {
  email?: string;
  orderNo?: string;
  password?: string;
};

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  let body: ResetPasswordBody;
  try {
    body = (await req.json()) as ResetPasswordBody;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const orderNo = body.orderNo?.trim().toUpperCase() ?? "";
  const password = body.password ?? "";

  if (!validEmail(email)) {
    return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
  }

  if (!orderNo) {
    return NextResponse.json({ error: "请输入付款订单编号" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "密码至少需要 6 个字符" }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();

    const { data: order, error: orderError } = await supabase
      .from("payment_applications")
      .select("id, email, order_no, status")
      .eq("email", email)
      .eq("order_no", orderNo)
      .eq("status", "confirmed")
      .maybeSingle();

    if (orderError) throw orderError;
    if (!order) {
      return NextResponse.json(
        { error: "没有找到已开通的订单，请检查邮箱和订单编号" },
        { status: 404 }
      );
    }

    const user = await findAuthUserByEmail(supabase, email);
    if (!user) {
      return NextResponse.json({ error: "没有找到这个注册邮箱" }, { status: 404 });
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
    });

    if (updateError) throw updateError;

    return NextResponse.json({
      ok: true,
      message: "密码已重置，请使用新密码登录",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "重置密码失败";
    console.error("[reset password by order] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
