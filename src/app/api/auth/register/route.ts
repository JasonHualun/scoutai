import { NextRequest, NextResponse } from "next/server";
import { CAPTCHA_COOKIE, verifyCaptchaToken } from "@/lib/captcha";
import { NEW_USER_FREE_CREDITS } from "@/lib/membership";
import { createServiceRoleClient } from "@/lib/supabase";
import { findAuthUserByEmail } from "@/lib/supabase-admin-users";

type RegisterBody = {
  email?: string;
  password?: string;
  captcha?: string;
};

const registerAttempts = new Map<string, { count: number; resetAt: number }>();
const REGISTER_WINDOW_MS = 10 * 60 * 1000;
const REGISTER_MAX_ATTEMPTS = 8;

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function rateLimitKey(req: NextRequest, email: string) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${forwarded || "unknown"}:${email}`;
}

function registerRateLimited(req: NextRequest, email: string) {
  const key = rateLimitKey(req, email);
  const now = Date.now();
  const current = registerAttempts.get(key);

  if (!current || current.resetAt <= now) {
    registerAttempts.set(key, { count: 1, resetAt: now + REGISTER_WINDOW_MS });
    return false;
  }

  current.count += 1;
  registerAttempts.set(key, current);
  return current.count > REGISTER_MAX_ATTEMPTS;
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

async function ensureStarterMembership(
  supabase: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  email: string
) {
  const { data: current, error: readError } = await supabase
    .from("memberships")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) {
    console.error("[auth register] starter membership read failed:", readError.message);
    return;
  }

  if (current) return;

  const { error: insertError } = await supabase.from("memberships").insert({
    user_id: userId,
    email,
    plan: "free",
    pro_until: null,
    prediction_credits: NEW_USER_FREE_CREDITS,
  });

  if (insertError) {
    console.error("[auth register] starter membership create failed:", insertError.message);
  }
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
  const captchaToken = req.cookies.get(CAPTCHA_COOKIE)?.value;

  if (!verifyCaptchaToken(captchaToken, body.captcha)) {
    const response = NextResponse.json({ error: "验证码错误，请重新输入" }, { status: 400 });
    response.cookies.delete(CAPTCHA_COOKIE);
    return response;
  }

  if (!validEmail(email)) {
    return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "密码至少需要 6 个字符" }, { status: 400 });
  }

  if (registerRateLimited(req, email)) {
    const response = NextResponse.json({ error: "操作太频繁，请稍后再试" }, { status: 429 });
    response.cookies.delete(CAPTCHA_COOKIE);
    return response;
  }

  try {
    const supabase = createServiceRoleClient();
    const existingUser = await findAuthUserByEmail(supabase, email);

    if (existingUser) {
      const isPro = await hasActiveProMembership(supabase, existingUser.id);
      await ensureStarterMembership(supabase, existingUser.id, email);

      const response = NextResponse.json(
        {
          error: isPro
            ? "这个邮箱已经是 Pro 账号，请直接登录；忘记密码请走找回流程"
            : "这个邮箱已经注册，请直接登录；忘记密码请走找回流程",
        },
        { status: 409 }
      );
      response.cookies.delete(CAPTCHA_COOKIE);
      return response;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) throw error;
    if (data.user?.id) {
      await ensureStarterMembership(supabase, data.user.id, email);
    }

    const response = NextResponse.json({
      ok: true,
      user: { id: data.user?.id, email },
      message: "账号已创建，可以直接登录",
    });
    response.cookies.delete(CAPTCHA_COOKIE);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "注册失败，请稍后重试";
    console.error("[auth register] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
