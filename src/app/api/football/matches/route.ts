import { NextResponse } from "next/server";
import { getLiveMatches, getMarketTestMatches, getTodayMatches } from "@/lib/football-api";
import { translateLeague, translateTeam } from "@/lib/league-translations";
import { formatBeijingClock } from "@/lib/time-format";

export const revalidate = 300;

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
  coverage?: {
    provider?: string;
    oddsAvailable?: boolean;
    liveOddsAvailable?: boolean;
    xgAvailable?: boolean;
    isCoreLeague?: boolean;
  };
};

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
  coverage?: FixtureLike["coverage"];
};

function mapFixtureToMatchCard(fixture: FixtureLike): MatchCard {
  const statusShort = fixture.fixture.status.short;
  let status: MatchStatus = "upcoming";
  if (["1H", "2H", "ET", "BT"].includes(statusShort)) status = "live";
  else if (["FT", "AET", "PEN"].includes(statusShort)) status = "finished";

  return {
    id: fixture.fixture.id,
    leagueId: fixture.league.id,
    league: translateLeague(`${fixture.league.name} · ${fixture.league.round ?? ""}`.trim()),
    homeTeam: translateTeam(fixture.teams.home.name),
    awayTeam: translateTeam(fixture.teams.away.name),
    kickOff: formatBeijingClock(fixture.fixture.date),
    minute: fixture.fixture.status.elapsed ?? undefined,
    homeScore: fixture.goals.home ?? 0,
    awayScore: fixture.goals.away ?? 0,
    status,
    coverage: fixture.coverage,
  };
}

export async function GET() {
  try {
    const [liveRes, todayRes, marketTestRes] = await Promise.allSettled([
      getLiveMatches(),
      getTodayMatches(),
      getMarketTestMatches(1),
    ]);

    const liveFixtures =
      liveRes.status === "fulfilled" ? (liveRes.value.response as FixtureLike[]) ?? [] : [];
    const todayFixtures =
      todayRes.status === "fulfilled" ? (todayRes.value.response as FixtureLike[]) ?? [] : [];
    const marketTestFixtures =
      marketTestRes.status === "fulfilled"
        ? (marketTestRes.value.response as FixtureLike[]) ?? []
        : [];

    const seen = new Set<string>();
    const fixtures = [...liveFixtures, ...todayFixtures, ...marketTestFixtures].filter((fixture) => {
      const key = String(fixture.fixture.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({
      matches: fixtures.map(mapFixtureToMatchCard),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        matches: [],
        updatedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Failed",
      },
      { status: 200 }
    );
  }
}
