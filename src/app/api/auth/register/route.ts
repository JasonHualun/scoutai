import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";

type RegisterBody = {
  email?: string;
  password?: string;
};

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function hasActiveProMembership(
  supabase: ReturnType<typeof createServiceRoleClient>,
  userId: string
) {
  const { data, error } = await supabase
    .from("memberships")
    .select("plan, pro_until")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[auth register] membership check failed:", error.message);
    return false;
  }

  return (
    data?.plan === "pro" &&
    !!data.pro_until &&
    new Date(data.pro_until).getTime() > Date.now()
  );
}

export async function POST(req: NextRequest) {
  let body: RegisterBody;
  try {
    body = (await req.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";

  if (!validEmail(email)) {
    return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "密码至少需要 6 个字符" }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();
    const { data: users, error: listError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listError) throw listError;

    const existingUser = users.users.find((user) => user.email?.toLowerCase() === email);

    if (existingUser) {
      const isPro = await hasActiveProMembership(supabase, existingUser.id);
      if (isPro) {
        return NextResponse.json(
          { error: "该邮箱是 Pro 账号，请用订单编号找回密码" },
          { status: 409 }
        );
      }

      const { error: updateError } = await supabase.auth.admin.updateUserById(existingUser.id, {
        password,
        email_confirm: true,
      });

      if (updateError) throw updateError;

      return NextResponse.json({
        ok: true,
        user: { id: existingUser.id, email },
        message: "账号密码已更新，可以直接登录",
      });
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      user: { id: data.user?.id, email },
      message: "账号已创建，可以直接登录",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "注册失败，请稍后重试";
    console.error("[auth register] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
