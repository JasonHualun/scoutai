import { NextRequest, NextResponse } from "next/server";
import { CAPTCHA_COOKIE, verifyCaptchaToken } from "@/lib/captcha";

type LoginGuardBody = {
  captcha?: string;
};

export async function POST(req: NextRequest) {
  let body: LoginGuardBody;
  try {
    body = (await req.json()) as LoginGuardBody;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const token = req.cookies.get(CAPTCHA_COOKIE)?.value;
  if (!verifyCaptchaToken(token, body.captcha)) {
    const response = NextResponse.json(
      { error: "验证码错误，请重新输入" },
      { status: 400 }
    );
    response.cookies.delete(CAPTCHA_COOKIE);
    return response;
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(CAPTCHA_COOKIE);
  return response;
}
