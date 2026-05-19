import HomeClient, { MatchCard } from "@/components/HomeClient";
import {
  getLiveMatches,
  getTodayMatches,
  getUpcomingMatches,
} from "@/lib/football-api";
import { translateLeague, translateTeam } from "@/lib/league-translations";
import { formatBeijingClock } from "@/lib/time-format";

type MatchStatus = "live" | "upcoming" | "finished";

type FixtureLike = {
  fixture: {
    id: number;
    date: string;
    status: { short: string; elapsed?: number | null };
  };
  league: { id?: number; name: string; round?: string | null };
  teams: { home: { name: string }; away: { name: string } };
  goals: { home?: number | null; away?: number | null };
};

function mapFixtureToMatchCard(fixture: FixtureLike): MatchCard {
  const statusShort = fixture.fixture.status.short;
  let status: MatchStatus = "upcoming";
  if (["1H", "2H", "ET", "BT"].includes(statusShort)) status = "live";
  else if (["FT", "AET", "PEN"].includes(statusShort)) status = "finished";

  const fixtureDate = fixture.fixture.date;

  return {
    id: fixture.fixture.id,
    league: translateLeague(`${fixture.league.name} · ${fixture.league.round ?? ""}`.trim()),
    homeTeam: translateTeam(fixture.teams.home.name),
    awayTeam: translateTeam(fixture.teams.away.name),
    kickOff: formatBeijingClock(fixtureDate),
    date: fixtureDate,
    minute: fixture.fixture.status.elapsed ?? undefined,
    homeScore: fixture.goals.home ?? 0,
    awayScore: fixture.goals.away ?? 0,
    status,
    leagueId: fixture.league.id ?? 0,
  };
}

export default async function Home() {
  let matches: MatchCard[] = [];

  try {
    const [todayRes, liveRes, upcomingRes] = await Promise.allSettled([
      getTodayMatches(),
      getLiveMatches(),
      getUpcomingMatches(7),
    ]);

    const todayFixtures =
      todayRes.status === "fulfilled"
        ? ((todayRes.value.response as FixtureLike[] | undefined) ?? [])
        : [];
    const liveFixtures =
      liveRes.status === "fulfilled"
        ? ((liveRes.value.response as FixtureLike[] | undefined) ?? [])
        : [];
    const upcomingFixtures =
      upcomingRes.status === "fulfilled"
        ? ((upcomingRes.value.response as FixtureLike[] | undefined) ?? [])
        : [];

    if (upcomingRes.status === "rejected") {
      console.error("[page] upcoming fixtures failed:", upcomingRes.reason);
    }

    const seen = new Set<string>();
    matches = [...liveFixtures, ...todayFixtures, ...upcomingFixtures]
      .map(mapFixtureToMatchCard)
      .filter((match) => {
        const key = String(match.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  } catch (error) {
    console.error("[page] failed to load fixtures:", error);
    matches = [];
  }

  return <HomeClient initialMatches={matches} />;
}
