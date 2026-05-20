import { NextResponse } from "next/server";
import {
  CAPTCHA_COOKIE,
  CAPTCHA_MAX_AGE_SECONDS,
  createCaptchaCode,
  createCaptchaToken,
} from "@/lib/captcha";

function captchaSvg(code: string) {
  const chars = code.split("");
  const text = chars
    .map(
      (char, index) =>
        `<text x="${31 + index * 30}" y="${43 + (index % 2 === 0 ? 0 : 3)}" transform="rotate(${index % 2 === 0 ? -8 : 7} ${31 + index * 30} 43)">${char}</text>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="150" height="58" viewBox="0 0 150 58" role="img" aria-label="验证码">
  <rect width="150" height="58" rx="14" fill="#06110d"/>
  <path d="M8 18 C34 5, 58 56, 88 18 S128 45, 144 16" fill="none" stroke="#00ff87" stroke-width="1.5" opacity="0.35"/>
  <path d="M6 42 C35 30, 49 7, 78 30 S116 55, 145 31" fill="none" stroke="#e5fff3" stroke-width="1" opacity="0.22"/>
  <g fill="#d9ffe9" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="28" font-weight="800" letter-spacing="8">
    ${text}
  </g>
  <g stroke="#00ff87" opacity="0.28">
    <line x1="14" y1="12" x2="136" y2="48"/>
    <line x1="18" y1="50" x2="129" y2="10"/>
  </g>
</svg>`;
}

export async function GET() {
  const code = createCaptchaCode();
  const response = new NextResponse(captchaSvg(code), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });

  response.cookies.set(CAPTCHA_COOKIE, createCaptchaToken(code), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CAPTCHA_MAX_AGE_SECONDS,
  });

  return response;
}
