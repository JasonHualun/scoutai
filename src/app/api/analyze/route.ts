import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  analyzeWithMinimax,
  calculateAnalysisPrediction,
  MatchAnalysisData,
  UserPreferences,
} from "@/lib/minimax";
import { normalizeMembership } from "@/lib/membership";

export async function POST(req: NextRequest) {
  try {
    const matchData: MatchAnalysisData = await req.json();

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const supabase = createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Token 无效" }, { status: 401 });
    }

    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select("plan, pro_until")
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      console.error("[analyze] membership check failed:", membershipError.message);
      return NextResponse.json(
        { error: "会员系统尚未配置，请联系管理员" },
        { status: 402 }
      );
    }

    const normalizedMembership = normalizeMembership(membership, user);
    if (normalizedMembership.plan !== "pro") {
      return NextResponse.json(
        { error: "Pro 高级版用户可使用 Claude 深度分析" },
        { status: 402 }
      );
    }

    const { data: prefs, error: prefsError } = await supabase
      .from("user_preferences")
      .select("risk_level, capital, preferred_markets, preferred_models")
      .eq("user_id", user.id)
      .single();

    if (prefsError || !prefs) {
      return NextResponse.json(
        { error: "未找到用户偏好设置，请先完成个性化设置" },
        { status: 400 }
      );
    }

    const userPrefs: UserPreferences = {
      risk_level: prefs.risk_level ?? "balanced",
      capital: prefs.capital ?? 1000,
      preferred_markets: prefs.preferred_markets ?? [],
      preferred_models: prefs.preferred_models ?? [],
    };

    const prediction = calculateAnalysisPrediction(matchData, userPrefs);
    const analysis = await analyzeWithMinimax(matchData, userPrefs);

    return NextResponse.json({ analysis, prediction });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "分析失败";
    console.error("[analyze] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
