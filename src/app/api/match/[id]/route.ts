import { NextResponse } from "next/server";
import {
  getMatchStatistics,
  getMatchOdds,
  getTeamRecentForm,
} from "@/lib/football-api";

export const revalidate = 180;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const fixtureId = Number(resolvedParams.id);
  console.log('API Route - fixtureId received:', fixtureId);

  if (!fixtureId || Number.isNaN(fixtureId)) {
    return NextResponse.json(
      { error: "Invalid fixture id" },
      { status: 400 }
    );
  }

  try {
    console.log('API Route - Fetching data for fixtureId:', fixtureId);
    const [statsRes, oddsRes] = await Promise.allSettled([
      getMatchStatistics(fixtureId),
      getMatchOdds(fixtureId),
    ]);
    console.log('API Route - Stats result:', statsRes.status);
    console.log('API Route - Odds result:', oddsRes.status);

    const statistics = statsRes.status === "fulfilled" ? statsRes.value : null;
    const odds = oddsRes.status === "fulfilled" ? oddsRes.value : null;

    console.log('API Route - Statistics data:', statistics ? 'Has data' : 'null');
    console.log('API Route - Odds data:', odds ? 'Has data' : 'null');

    let homeForm: any = null;
    let awayForm: any = null;
    let homeTeamId: number | null = null;
    let awayTeamId: number | null = null;

    if (statistics && Array.isArray(statistics.response)) {
      const teams = statistics.response;
      console.log('API Route - Teams found:', teams.length);
      if (teams.length >= 2) {
        homeTeamId = teams[0].team.id;
        awayTeamId = teams[1].team.id;
        console.log('API Route - Home team:', teams[0].team.name, 'ID:', homeTeamId);
        console.log('API Route - Away team:', teams[1].team.name, 'ID:', awayTeamId);
        const [homeFormRes, awayFormRes] = await Promise.allSettled([
          getTeamRecentForm(homeTeamId),
          getTeamRecentForm(awayTeamId),
        ]);
        homeForm =
          homeFormRes.status === "fulfilled" ? homeFormRes.value : null;
        awayForm =
          awayFormRes.status === "fulfilled" ? awayFormRes.value : null;
      }
    }

    const response = {
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

    console.log('API Route - Returning response with teamIds:', response.teamIds);
    return NextResponse.json(response);
  } catch (e: any) {
    console.error('API Route - Error fetching match data:', e.message);
    return NextResponse.json(
      {
        statistics: null,
        odds: null,
        recentForm: { home: null, away: null },
        error: e?.message ?? "Failed to fetch match data",
      },
      { status: 200 }
    );
  }
}

