import { NextResponse } from "next/server";
import { getLiveMatches } from "@/lib/football-api";

export const revalidate = 300;

const FEATURED_LEAGUE_IDS = new Set([
  // api-football IDs
  39, 140, 78, 135, 61, 2, 3, 1, 4, 5, 10,
  // football-data.org IDs
  2021, 2002, 2014, 2019, 2015, 2001, 2018, 2152, 2000,
]);

type MatchStatus = "live" | "upcoming" | "finished";

type MatchCard = {
  id: number;
  leagueId: number;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickOff: string;
  date?: string;
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

  const fixtureDate = fixture.fixture.date;
  const d = new Date(fixtureDate);
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
    date: fixtureDate,
    minute: fixture.fixture.status.elapsed ?? undefined,
    homeScore: fixture.goals.home ?? 0,
    awayScore: fixture.goals.away ?? 0,
    status,
  };
}

export async function GET() {
  console.log('Using API key:', process.env.FOOTBALL_API_KEY?.slice(0, 8));
  console.log('Using API key 2:', process.env.FOOTBALL_API_KEY_2?.slice(0, 8));

  try {
    const data = await getLiveMatches();
    console.log('API response status:', data?.errors ? 'error' : 'ok');
    console.log('API response data:', JSON.stringify(data).slice(0, 200));

    const fixtures = (data.response ?? []).filter(
      (f: any) => FEATURED_LEAGUE_IDS.has(f.league.id)
    );
    const matches: MatchCard[] = fixtures.map(mapFixtureToMatchCard);
    return NextResponse.json({
      matches,
      updatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.log('API error:', e?.message);
    return NextResponse.json(
      {
        matches: [],
        updatedAt: new Date().toISOString(),
        error: e?.message ?? "Failed to load live matches",
      },
      { status: 200 }
    );
  }
}

