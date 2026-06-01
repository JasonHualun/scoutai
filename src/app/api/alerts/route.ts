import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/api-auth";
import { AlertItem, AlertType } from "@/lib/alerts";
import { translateTeamText } from "@/lib/league-translations";
import { createServiceRoleClient } from "@/lib/supabase";

type AlertRow = {
  id: string;
  match_id: string;
  match_name: string;
  score: string;
  type: AlertType;
  content: string;
  status: "unread" | "read" | "archived";
  created_at: string;
};

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return fallback;
}

function alertTablesMissing(message: string) {
  const lower = message.toLowerCase();
  return lower.includes("alerts") && (
    lower.includes("does not exist") ||
    lower.includes("schema cache") ||
    lower.includes("relation") ||
    lower.includes("table")
  );
}

function mapAlert(row: AlertRow): AlertItem {
  return {
    id: row.id,
    match_id: row.match_id,
    match_name: translateTeamText(row.match_name),
    score: row.score,
    type: row.type,
    content: translateTeamText(row.content),
    created_at: row.created_at,
    read: row.status !== "unread",
    source: "server",
  };
}

export async function GET(req: NextRequest) {
  const { user, error } = await currentUser(req, "请先登录后查看提醒");
  if (error || !user) return NextResponse.json({ alerts: [] });

  try {
    const supabase = createServiceRoleClient();
    const { data, error: readError } = await supabase
      .from("alerts")
      .select("id, match_id, match_name, score, type, content, status, created_at")
      .eq("user_id", user.id)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(80);

    if (readError) throw readError;

    return NextResponse.json({
      alerts: ((data ?? []) as AlertRow[]).map(mapAlert),
    });
  } catch (err) {
    const message = errorMessage(err, "读取提醒失败");
    if (alertTablesMissing(message)) {
      return NextResponse.json({ alerts: [], setupRequired: true });
    }
    console.error("[alerts] read failed:", message);
    return NextResponse.json({ alerts: [], error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { user, error } = await currentUser(req, "请先登录后操作提醒");
  if (error || !user) return NextResponse.json({ error }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    all?: boolean;
    status?: "read" | "archived";
  };
  const status = body.status === "archived" ? "archived" : "read";

  try {
    const supabase = createServiceRoleClient();
    let query = supabase
      .from("alerts")
      .update({
        status,
        read_at: status === "read" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (!body.all) {
      if (!body.id) return NextResponse.json({ error: "缺少提醒 ID" }, { status: 400 });
      query = query.eq("id", body.id);
    } else {
      query = query.eq("status", "unread");
    }

    const { error: updateError } = await query;
    if (updateError) throw updateError;

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = errorMessage(err, "更新提醒失败");
    if (alertTablesMissing(message)) {
      return NextResponse.json({ ok: false, setupRequired: true }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

