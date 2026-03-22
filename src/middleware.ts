import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 检查是否存在 Supabase auth cookie（浏览器端由 supabase-js 设置）
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/onboarding")) {
    return NextResponse.next();
  }

  // Supabase 在 localStorage 存 session，无法在 Edge 读取
  // 改为在 onboarding 页面内做客户端守卫（见 useEffect），middleware 仅作占位
  return NextResponse.next();
}

export const config = {
  matcher: ["/onboarding/:path*"],
};
