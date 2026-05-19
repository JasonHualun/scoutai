import { NextResponse } from "next/server";
import {
  getFixtureById,
  getMatchStatistics,
  getMatchOdds,
  getTeamRecentForm,
} from "@/lib/football-api";

export const revalidate = 180;

type TeamInfo = { id?: number; name?: string };
type FixtureItem = { teams?: { home?: TeamInfo; away?: TeamInfo } };
type StatisticTeam = { team?: { id?: number } };

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const fixtureId = Number(resolvedParams.id);

  if (!fixtureId || Number.isNaN(fixtureId)) {
    return NextResponse.json(
      { error: "Invalid fixture id" },
      { status: 400 }
    );
  }

  try {
    const [fixtureRes, statsRes, oddsRes] = await Promise.allSettled([
      getFixtureById(fixtureId),
      getMatchStatistics(fixtureId),
      getMatchOdds(fixtureId),
    ]);

    const fixture = fixtureRes.status === "fulfilled" ? fixtureRes.value : null;
    const statistics = statsRes.status === "fulfilled" ? statsRes.value : null;
    const odds = oddsRes.status === "fulfilled" ? oddsRes.value : null;

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

    return NextResponse.json(response);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to fetch match data";
    console.error("[match] failed to fetch match data:", message);
    return NextResponse.json(
      {
        fixture: null,
        statistics: null,
        odds: null,
        recentForm: { home: null, away: null },
        error: message,
      },
      { status: 200 }
    );
  }
}

