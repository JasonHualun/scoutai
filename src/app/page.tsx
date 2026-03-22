import { getTodayMatches, getLiveMatches, getUpcomingMatches } from "@/lib/football-api";
import HomeClient, { MatchCard } from "@/components/HomeClient";

type MatchStatus = "live" | "upcoming" | "finished";

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
  const kickOff = `${hours}:${mins}`;

  return {
    id: fixture.fixture.id,
    league: `${fixture.league.name} · ${fixture.league.round ?? ""}`.trim(),
    homeTeam: fixture.teams.home.name,
    awayTeam: fixture.teams.away.name,
    kickOff,
    date: fixtureDate,
    minute: fixture.fixture.status.elapsed ?? undefined,
    homeScore: fixture.goals.home ?? 0,
    awayScore: fixture.goals.away ?? 0,
    status,
    leagueId: fixture.league.id,
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
      todayRes.status === "fulfilled" ? todayRes.value.response ?? [] : [];
    const liveFixtures =
      liveRes.status === "fulfilled" ? liveRes.value.response ?? [] : [];
    const upcomingFixtures =
      upcomingRes.status === "fulfilled" ? upcomingRes.value.response ?? [] : [];

    console.log('[page] live:', liveFixtures.length, 'today:', todayFixtures.length, 'upcoming:', upcomingFixtures.length);
    if (upcomingRes.status === "rejected") console.error('[page] upcoming failed:', upcomingRes.reason);

    // live 优先（状态最新），然后今天，最后未来；按 id 去重
    const liveResults = liveFixtures.map(mapFixtureToMatchCard);
    const todayResults = todayFixtures.map(mapFixtureToMatchCard);
    const upcomingResults = upcomingFixtures.map(mapFixtureToMatchCard);

    const seen = new Set<string>();
    const allMatches = [...liveResults, ...todayResults, ...upcomingResults].filter(m => {
      const key = String(m.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log('[page] total after dedup:', allMatches.length, '| upcoming status sample:', upcomingResults.slice(0,3).map(m => ({ id: m.id, status: m.status, date: m.date?.slice(0,10), league: m.leagueId })));
    matches = allMatches;
  } catch (e) {
    console.error('[page] fetch error:', e);
    matches = [];
  }

  return <HomeClient initialMatches={matches} />;
}
