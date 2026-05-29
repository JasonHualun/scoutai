import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

function adminTokenValid(req: NextRequest) {
  const expected = process.env.ADMIN_ACCESS_TOKEN;
  if (!expected) return false;
  return req.headers.get("x-admin-token") === expected;
}

function bearerToken(req: NextRequest) {
  const header = req.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim();
}

export async function isAdminRequest(req: NextRequest) {
  if (adminTokenValid(req)) return true;

  const token = bearerToken(req);
  if (!token) return false;

  const supabase = createServerClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return false;

  return data.user.app_metadata?.role === "admin";
}

export function unauthorized(message = "管理员权限无效") {
  return NextResponse.json({ error: message }, { status: 401 });
}
