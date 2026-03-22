import { NextResponse } from "next/server";
import { getLiveMatches, getTodayMatches } from "@/lib/football-api";

export const revalidate = 300;

type MatchStatus = "live" | "upcoming" | "finished";

type MatchCard = {
  id: number;
  leagueId: number;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickOff: string;
  minute?: number;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
};

function mapFixtureToMatchCard(fixture: any): MatchCard {
  const statusShort = fixture.fixture.status.short as string;
  let status: MatchStatus = "upcoming";
  if (["1H", "2H", "ET", "BT"].includes(statusShort)) status = "live";
  else if (["FT", "AET", "PEN"].includes(statusShort)) status = "finished";

  const d = new Date(fixture.fixture.date);
  const rawHours = d.getUTCHours() + 8;
  const hours = String(rawHours >= 24 ? rawHours - 24 : rawHours).padStart(2, "0");
  const mins = String(d.getUTCMinutes()).padStart(2, "0");

  return {
    id: fixture.fixture.id,
    leagueId: fixture.league.id,
    league: `${fixture.league.name} · ${fixture.league.round ?? ""}`.trim(),
    homeTeam: fixture.teams.home.name,
    awayTeam: fixture.teams.away.name,
    kickOff: `${hours}:${mins}`,
    minute: fixture.fixture.status.elapsed ?? undefined,
    homeScore: fixture.goals.home ?? 0,
    awayScore: fixture.goals.away ?? 0,
    status,
  };
}

export async function GET() {
  try {
    const [liveRes, todayRes] = await Promise.allSettled([
      getLiveMatches(),
      getTodayMatches(),
    ]);

    const liveFixtures = liveRes.status === "fulfilled" ? liveRes.value.response ?? [] : [];
    const todayFixtures = todayRes.status === "fulfilled" ? todayRes.value.response ?? [] : [];

    // live 优先，合并后按 fixture.id 去重
    const seen = new Set<string>();
    const all = [...liveFixtures, ...todayFixtures].filter((f: any) => {
      const key = String(f.fixture.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const matches: MatchCard[] = all.map(mapFixtureToMatchCard);

    return NextResponse.json({ matches, updatedAt: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json(
      { matches: [], updatedAt: new Date().toISOString(), error: e?.message ?? "Failed" },
      { status: 200 }
    );
  }
}
