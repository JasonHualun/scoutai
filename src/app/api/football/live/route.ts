import { NextResponse } from "next/server";
import { getLiveMatches } from "@/lib/football-api";
import {
  isSupportedLeague,
  translateLeague,
  translateTeam,
} from "@/lib/league-translations";
import { formatBeijingClock } from "@/lib/time-format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MatchStatus = "live" | "upcoming" | "finished";

type FixtureLike = {
  fixture: {
    id: number;
    date: string;
    status: { short: string; elapsed?: number | null };
  };
  league: { id: number; name: string; round?: string | null };
  teams: { home: { name: string }; away: { name: string } };
  goals: { home?: number | null; away?: number | null };
};

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

function mapFixtureToMatchCard(fixture: FixtureLike): MatchCard {
  const statusShort = fixture.fixture.status.short;
  let status: MatchStatus = "upcoming";
  if (["1H", "2H", "ET", "BT"].includes(statusShort)) status = "live";
  else if (["FT", "AET", "PEN", "PST", "CANC", "ABD", "AWD", "WO"].includes(statusShort))
    status = "finished";

  const fixtureDate = fixture.fixture.date;

  return {
    id: fixture.fixture.id,
    leagueId: fixture.league.id,
    league: translateLeague(`${fixture.league.name} · ${fixture.league.round ?? ""}`.trim()),
    homeTeam: translateTeam(fixture.teams.home.name),
    awayTeam: translateTeam(fixture.teams.away.name),
    kickOff: formatBeijingClock(fixtureDate),
    date: fixtureDate,
    minute: fixture.fixture.status.elapsed ?? undefined,
    homeScore: fixture.goals.home ?? 0,
    awayScore: fixture.goals.away ?? 0,
    status,
  };
}

export async function GET() {
  try {
    const data = await getLiveMatches();
    const fixtures = ((data.response as FixtureLike[]) ?? []).filter((fixture) =>
      isSupportedLeague(fixture.league.id, fixture.league.name)
    );
    const matches = fixtures.map(mapFixtureToMatchCard);

    return NextResponse.json({
      matches,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        matches: [],
        updatedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Failed to load live matches",
      },
      { status: 200 }
    );
  }
}
