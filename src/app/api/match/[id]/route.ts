import { NextResponse } from "next/server";
import {
  getFixtureById,
  getLiveMatches,
  getMatchMarketSignals,
  getMatchStatistics,
  getMatchOdds,
  getMarketTestMatches,
  getTeamRecentForm,
  getTodayMatches,
  getUpcomingMatches,
} from "@/lib/football-api";

export const dynamic = "force-dynamic";
export const revalidate = 30;

type TeamInfo = { id?: number; name?: string };
type FixtureItem = { teams?: { home?: TeamInfo; away?: TeamInfo } };
type FixtureResponse = { response?: unknown[]; results?: number; errors?: unknown };
type FixtureWithId = { fixture?: { id?: number } };
type StatisticTeam = { team?: { id?: number } };

async function findFixtureFromLists(fixtureId: number): Promise<FixtureResponse | null> {
  const results = await Promise.allSettled([
    getLiveMatches(),
    getTodayMatches(),
    getUpcomingMatches(7),
    getMarketTestMatches(7),
  ]);

  const fixtures = results
    .filter((result): result is PromiseFulfilledResult<FixtureResponse> => result.status === "fulfilled")
    .flatMap((result) => result.value.response ?? []);
  const found = fixtures.find((item) => Number((item as FixtureWithId).fixture?.id) === fixtureId);

  return found ? { response: [found], results: 1, errors: {} } : null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const fixtureLookupId = decodeURIComponent(resolvedParams.id);
  const fixtureId = Number(fixtureLookupId.replace(/\D/g, ""));

  if (!fixtureLookupId || !fixtureId || Number.isNaN(fixtureId)) {
    return NextResponse.json(
      { error: "Invalid fixture id" },
      { status: 400 }
    );
  }

  try {
    const [fixtureRes, statsRes, oddsRes, marketSignalsRes] = await Promise.allSettled([
      getFixtureById(fixtureLookupId),
      getMatchStatistics(fixtureLookupId),
      getMatchOdds(fixtureLookupId),
      getMatchMarketSignals(fixtureLookupId),
    ]);

    let fixture = fixtureRes.status === "fulfilled" ? fixtureRes.value : null;
    const statistics = statsRes.status === "fulfilled" ? statsRes.value : null;
    const odds = oddsRes.status === "fulfilled" ? oddsRes.value : null;
    const marketSignals =
      marketSignalsRes.status === "fulfilled" ? marketSignalsRes.value : null;

    if (!Array.isArray(fixture?.response) || fixture.response.length === 0) {
      fixture = await findFixtureFromLists(fixtureId);
    }

    let homeForm: unknown = null;
    let awayForm: unknown = null;
    let homeTeamId: number | null = null;
    let awayTeamId: number | null = null;

    if (statistics && Array.isArray(statistics.response)) {
      const teams = statistics.response as StatisticTeam[];
      if (teams.length >= 2) {
        homeTeamId = teams[0].team?.id ?? null;
        awayTeamId = teams[1].team?.id ?? null;
      }
    }

    const fixtureItem = Array.isArray(fixture?.response)
      ? (fixture.response[0] as FixtureItem | undefined)
      : null;
    homeTeamId = homeTeamId ?? fixtureItem?.teams?.home?.id ?? null;
    awayTeamId = awayTeamId ?? fixtureItem?.teams?.away?.id ?? null;

    const [homeFormRes, awayFormRes] = await Promise.allSettled([
      homeTeamId ? getTeamRecentForm(homeTeamId) : Promise.resolve(null),
      awayTeamId ? getTeamRecentForm(awayTeamId) : Promise.resolve(null),
    ]);
    homeForm =
      homeFormRes.status === "fulfilled" ? homeFormRes.value : null;
    awayForm =
      awayFormRes.status === "fulfilled" ? awayFormRes.value : null;

    const response = {
      fixture,
      statistics,
      odds,
      marketSignals,
      recentForm: {
        home: homeForm,
        away: awayForm,
      },
      teamIds: {
        home: homeTeamId,
        away: awayTeamId,
      },
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to fetch match data";
    console.error("[match] failed to fetch match data:", message);
    return NextResponse.json(
      {
        fixture: null,
        statistics: null,
        odds: null,
        marketSignals: null,
        recentForm: { home: null, away: null },
        error: message,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}

