import { NextRequest, NextResponse } from "next/server";
import {
  buildServerAlertMatch,
  buildServerAlertsForRow,
  MonitoredMatchRow,
  snapshotForMatch,
} from "@/lib/server-alerts";
import { createServiceRoleClient } from "@/lib/supabase";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return fallback;
}

function alertTablesMissing(message: string) {
  const lower = message.toLowerCase();
  return (
    (lower.includes("monitored_matches") || lower.includes("alerts")) &&
    (lower.includes("does not exist") ||
      lower.includes("schema cache") ||
      lower.includes("relation") ||
      lower.includes("table"))
  );
}

function staleCutoffIso(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

async function upsertPendingPredictionMonitors() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("prediction_order_items")
    .select("user_id, fixture_id, league, home_team, away_team, kickoff_at, status_at_prediction")
    .eq("result_status", "pending")
    .neq("status_at_prediction", "finished")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data?.length) return 0;

  const now = new Date().toISOString();
  const rows = data.map((item) => ({
    user_id: item.user_id,
    email: "",
    fixture_id: String(item.fixture_id),
    provider_fixture_id: String(item.fixture_id),
    league: item.league,
    home_team: item.home_team,
    away_team: item.away_team,
    kickoff_at: item.kickoff_at,
    status: item.status_at_prediction,
    sources: ["prediction_order"],
    active: true,
    updated_at: now,
  }));

  const { error: upsertError } = await supabase
    .from("monitored_matches")
    .upsert(rows, { onConflict: "user_id,fixture_id" });

  if (upsertError) throw upsertError;
  return rows.length;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Cron 权限无效" }, { status: 401 });
  }

  try {
    const supabase = createServiceRoleClient();
    const predictionMonitors = await upsertPendingPredictionMonitors();
    const { data, error } = await supabase
      .from("monitored_matches")
      .select("id, user_id, fixture_id, league, home_team, away_team, kickoff_at, status, last_snapshot")
      .eq("active", true)
      .or(`kickoff_at.is.null,kickoff_at.gte.${staleCutoffIso(12)}`)
      .order("last_checked_at", { ascending: true, nullsFirst: true })
      .limit(80);

    if (error) throw error;

    const rows = (data ?? []) as MonitoredMatchRow[];
    const matchCache = new Map<string, Awaited<ReturnType<typeof buildServerAlertMatch>>>();
    let inserted = 0;
    let checked = 0;
    let deactivated = 0;
    const failures: Array<{ fixtureId: string; reason: string }> = [];

    for (const row of rows) {
      try {
        const fixtureId = String(row.fixture_id);
        let match = matchCache.get(fixtureId);
        if (!match) {
          match = await buildServerAlertMatch(fixtureId);
          matchCache.set(fixtureId, match);
        }

        const alerts = buildServerAlertsForRow(row, match);
        if (alerts.length > 0) {
          const { error: insertError } = await supabase.from("alerts").upsert(
            alerts.map((alert) => ({
              user_id: row.user_id,
              match_id: alert.match_id,
              alert_key: alert.alertKey,
              type: alert.type,
              match_name: alert.match_name,
              score: alert.score,
              content: alert.content,
              status: "unread",
              trigger_snapshot: alert.snapshot,
              notification_status: "pending",
              source: "server",
            })),
            { onConflict: "user_id,alert_key", ignoreDuplicates: true }
          );
          if (insertError) throw insertError;
          inserted += alerts.length;
        }

        const finished = match.status === "finished";
        const { error: updateError } = await supabase
          .from("monitored_matches")
          .update({
            last_snapshot: snapshotForMatch(match),
            status: match.status,
            active: !finished,
            ended_at: finished ? new Date().toISOString() : null,
            last_checked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (updateError) throw updateError;
        checked += 1;
        if (finished) deactivated += 1;
      } catch (rowError) {
        failures.push({ fixtureId: row.fixture_id, reason: errorMessage(rowError, "监控失败") });
      }
    }

    return NextResponse.json({
      ok: true,
      predictionMonitors,
      checked,
      inserted,
      deactivated,
      failures,
    });
  } catch (error) {
    const message = errorMessage(error, "服务端提醒任务失败");
    if (alertTablesMissing(message)) {
      return NextResponse.json({ ok: false, setupRequired: true, error: message });
    }
    console.error("[cron alerts] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = GET;
