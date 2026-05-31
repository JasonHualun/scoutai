import { NextResponse } from "next/server";
import {
  getLiveMatches,
  getMarketTestMatches,
  getTodayMatches,
  getUpcomingMatches,
} from "@/lib/football-api";

type FixtureLike = { fixture: { id: number } };

export async function GET() {
  const [todayRes, liveRes, upcomingRes, marketTestRes] = await Promise.allSettled([
    getTodayMatches(),
    getLiveMatches(),
    getUpcomingMatches(7),
    getMarketTestMatches(7),
  ]);

  const todayFixtures =
    todayRes.status === "fulfilled" ? (todayRes.value.response as FixtureLike[]) ?? [] : [];
  const liveFixtures =
    liveRes.status === "fulfilled" ? (liveRes.value.response as FixtureLike[]) ?? [] : [];
  const upcomingFixtures =
    upcomingRes.status === "fulfilled" ? (upcomingRes.value.response as FixtureLike[]) ?? [] : [];
  const marketTestFixtures =
    marketTestRes.status === "fulfilled"
      ? (marketTestRes.value.response as FixtureLike[]) ?? []
      : [];

  const seen = new Set<string>();
  const fixtures = [...liveFixtures, ...todayFixtures, ...upcomingFixtures, ...marketTestFixtures].filter((fixture) => {
    const key = String(fixture.fixture.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json({ fixtures });
}
