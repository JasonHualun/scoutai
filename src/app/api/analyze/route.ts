import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { analyzeWithMinimax, MatchAnalysisData, UserPreferences } from "@/lib/minimax";

export async function POST(req: NextRequest) {
  try {
    // Parse body first (can only read once)
    const matchData: MatchAnalysisData = await req.json();

    // Verify auth via Bearer token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const token = authHeader.slice(7);

    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Token 无效" }, { status: 401 });
    }

    // Fetch user preferences
    const { data: prefs, error: prefsError } = await supabase
      .from("user_preferences")
      .select("risk_level, capital, preferred_markets, preferred_models")
      .eq("user_id", user.id)
      .single();

    if (prefsError || !prefs) {
      return NextResponse.json({ error: "未找到用户偏好设置，请先完成个性化设置" }, { status: 400 });
    }

    const userPrefs: UserPreferences = {
      risk_level: prefs.risk_level ?? "balanced",
      capital: prefs.capital ?? 1000,
      preferred_markets: prefs.preferred_markets ?? [],
      preferred_models: prefs.preferred_models ?? [],
    };

    const analysis = await analyzeWithMinimax(matchData, userPrefs);
    return NextResponse.json({ analysis });
  } catch (e: any) {
    console.error("[analyze] error:", e);
    return NextResponse.json({ error: e.message ?? "分析失败" }, { status: 500 });
  }
}
