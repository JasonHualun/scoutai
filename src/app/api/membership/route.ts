import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceRoleClient } from "@/lib/supabase";
import { freeMembership, normalizeMembership } from "@/lib/membership";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ membership: freeMembership() });
  }

  const supabase = createServerClient();
  const token = authHeader.slice(7);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ membership: freeMembership() });
  }

  const serviceSupabase = createServiceRoleClient();
  const { data, error } = await serviceSupabase
    .from("memberships")
    .select("plan, pro_until")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[membership] read failed:", error.message);
    return NextResponse.json({
      membership: freeMembership(user.email),
      setupRequired: true,
    });
  }

  return NextResponse.json({ membership: normalizeMembership(data, user) });
}
