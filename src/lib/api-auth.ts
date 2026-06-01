import { NextRequest } from "next/server";
import { createServerClient } from "./supabase";

export function authToken(req: NextRequest) {
  return req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
}

export async function currentUser(req: NextRequest, fallback = "请先登录") {
  const token = authToken(req);
  if (!token) return { user: null, error: fallback };

  const authClient = createServerClient();
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return { user: null, error: "登录已过期，请重新登录" };

  return { user: data.user, error: null };
}

