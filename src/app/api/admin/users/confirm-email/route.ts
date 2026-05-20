import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "@/lib/admin-auth";
import { createServiceRoleClient } from "@/lib/supabase";

type ConfirmEmailBody = {
  email?: string;
};

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) return unauthorized();

  let body: ConfirmEmailBody;
  try {
    body = (await req.json()) as ConfirmEmailBody;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "请输入有效邮箱" }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();
    const { data, error: listError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listError) throw listError;

    const user = data.users.find((item) => item.email?.toLowerCase() === email);
    if (!user) {
      return NextResponse.json({ error: "没有找到这个注册邮箱" }, { status: 404 });
    }

    if (user.email_confirmed_at) {
      return NextResponse.json({
        ok: true,
        user: {
          id: user.id,
          email,
          emailConfirmedAt: user.email_confirmed_at,
        },
        message: "这个邮箱已经验证过了",
      });
    }

    const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      { email_confirm: true }
    );

    if (updateError) throw updateError;

    return NextResponse.json({
      ok: true,
      user: {
        id: updated.user?.id ?? user.id,
        email,
        emailConfirmedAt: updated.user?.email_confirmed_at ?? new Date().toISOString(),
      },
      message: "邮箱已手动验证，现在可以登录",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "手动验证邮箱失败";
    console.error("[admin confirm email] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
