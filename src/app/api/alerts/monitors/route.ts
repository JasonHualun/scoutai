import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/api-auth";
import { getFixtureById } from "@/lib/football-api";
import { translateLeague, translateTeam } from "@/lib/league-translations";
import { createServiceRoleClient } from "@/lib/supabase";

type FixtureResponseItem = {
  fixture?: {
    id?: number;
    date?: string | null;
    status?: { short?: string | null };
  };
  league?: { name?: string | null; round?: string | null };
  teams?: { home?: { name?: string | null }; away?: { name?: string | null } };
  coverage?: { providerMatchId?: string | null };
};

type SyncBody = {
  favoriteIds?: Array<string | number>;
  predictionPoolIds?: Array<string | number>;
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
  return (lower.includes("monitored_matches") || lower.includes("alerts")) && (
    lower.includes("does not exist") ||
    lower.includes("schema cache") ||
    lower.includes("relation") ||
    lower.includes("table")
  );
}

function normalizeIds(values?: Array<string | number>) {
  const seen = new Set<string>();
  return (values ?? [])
    .map((value) => String(value).trim())
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .slice(0, 80);
}

async function fixtureMeta(fixtureId: string) {
  try {
    const data = await getFixtureById(fixtureId);
    const fixture = ((data as { response?: FixtureResponseItem[] }).response ?? [])[0];
    if (!fixture) return null;

    return {
      providerFixtureId: String(fixture.coverage?.providerMatchId ?? fixture.fixture?.id ?? fixtureId),
      league: translateLeague(`${fixture.league?.name ?? ""} ${fixture.league?.round ?? ""}`.trim()),
      homeTeam: translateTeam(fixture.teams?.home?.name ?? "主队"),
      awayTeam: translateTeam(fixture.teams?.away?.name ?? "客队"),
      kickoffAt: fixture.fixture?.date ?? null,
      status: fixture.fixture?.status?.short ?? null,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { user, error } = await currentUser(req, "请先登录后查看监控比赛");
  if (error || !user) return NextResponse.json({ count: 0 });

  try {
    const supabase = createServiceRoleClient();
    const { count, error: countError } = await supabase
      .from("monitored_matches")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("active", true);

    if (countError) throw countError;
    return NextResponse.json({ count: count ?? 0 });
  } catch (err) {
    const message = errorMessage(err, "读取监控比赛失败");
    if (alertTablesMissing(message)) {
      return NextResponse.json({ count: 0, setupRequired: true });
    }
    return NextResponse.json({ count: 0, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, error } = await currentUser(req, "请先登录后同步监控比赛");
  if (error || !user) return NextResponse.json({ error }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as SyncBody;
  const favoriteIds = normalizeIds(body.favoriteIds);
  const predictionPoolIds = normalizeIds(body.predictionPoolIds);
  const ids = normalizeIds([...favoriteIds, ...predictionPoolIds]);

  try {
    const supabase = createServiceRoleClient();
    const now = new Date().toISOString();

    if (ids.length === 0) {
      const { error: clearError } = await supabase
        .from("monitored_matches")
        .update({ active: false, updated_at: now })
        .eq("user_id", user.id);
      if (clearError) throw clearError;
      return NextResponse.json({ ok: true, count: 0 });
    }

    const inList = `(${ids.map((id) => `"${id.replace(/"/g, "")}"`).join(",")})`;
    await supabase
      .from("monitored_matches")
      .update({ active: false, updated_at: now })
      .eq("user_id", user.id)
      .not("fixture_id", "in", inList);

    const rows = await Promise.all(
      ids.map(async (fixtureId) => {
        const meta = await fixtureMeta(fixtureId);
        const sources = [
          favoriteIds.includes(fixtureId) ? "favorite" : null,
          predictionPoolIds.includes(fixtureId) ? "prediction_pool" : null,
        ].filter(Boolean);

        return {
          user_id: user.id,
          email: user.email ?? "",
          fixture_id: fixtureId,
          provider_fixture_id: meta?.providerFixtureId ?? fixtureId,
          league: meta?.league ?? "",
          home_team: meta?.homeTeam ?? "主队",
          away_team: meta?.awayTeam ?? "客队",
          kickoff_at: meta?.kickoffAt,
          status: meta?.status ?? "unknown",
          sources,
          active: true,
          updated_at: now,
        };
      })
    );

    const { error: upsertError } = await supabase
      .from("monitored_matches")
      .upsert(rows, { onConflict: "user_id,fixture_id" });

    if (upsertError) throw upsertError;
    return NextResponse.json({ ok: true, count: rows.length });
  } catch (err) {
    const message = errorMessage(err, "同步监控比赛失败");
    if (alertTablesMissing(message)) {
      return NextResponse.json({ ok: false, setupRequired: true }, { status: 503 });
    }
    console.error("[alerts monitors] sync failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

