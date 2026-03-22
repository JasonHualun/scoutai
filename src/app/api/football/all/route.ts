import { getTodayMatches, getLiveMatches, getUpcomingMatches } from "@/lib/football-api";
import { NextResponse } from "next/server";

export async function GET() {
  const [todayRes, liveRes, upcomingRes] = await Promise.allSettled([
    getTodayMatches(),
    getLiveMatches(),
    getUpcomingMatches(7),
  ]);

  const todayFixtures = todayRes.status === "fulfilled" ? todayRes.value.response ?? [] : [];
  const liveFixtures = liveRes.status === "fulfilled" ? liveRes.value.response ?? [] : [];
  const upcomingFixtures = upcomingRes.status === "fulfilled" ? upcomingRes.value.response ?? [] : [];

  const seen = new Set<string>();
  const all = [...liveFixtures, ...todayFixtures, ...upcomingFixtures].filter(f => {
    const key = String(f.fixture.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json({ fixtures: all });
}
