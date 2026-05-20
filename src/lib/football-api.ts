import {
  isSupportedLeague,
  translateLeague,
  translateTeam,
} from "./league-translations";
import { beijingDateString } from "./time-format";

const API_URL = process.env.FOOTBALL_API_URL || "https://v3.football.api-sports.io";
const API_KEY = process.env.FOOTBALL_API_KEY;

const FD_API_URL = "https://api.football-data.org/v4";
const FD_API_KEY = process.env.FOOTBALL_DATA_API_KEY;

type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

type FootballApiResponse = {
  response?: unknown[];
  results?: number;
  errors?: unknown;
};

type FixtureItem = {
  league?: { id?: number; name?: string; round?: string | null };
  teams?: {
    home?: { id?: number; name?: string };
    away?: { id?: number; name?: string };
  };
};

type FallbackMatch = {
  id: number;
  utcDate: string;
  status: string;
  matchday?: number;
  minute?: number | null;
  competition?: { id?: number; name?: string };
  season?: { currentMatchday?: number };
  homeTeam?: { id?: number; name?: string };
  awayTeam?: { id?: number; name?: string };
  score?: {
    fullTime?: { home?: number | null; away?: number | null };
    halfTime?: { home?: number | null; away?: number | null };
  };
};

const CACHE_TTL_MS = 60 * 1000;
const UPCOMING_CACHE_TTL_MS = 10 * 60 * 1000;
const FALLBACK_COMPETITIONS = ["PL", "PD", "BL1", "SA", "FL1", "WC"];

const cache = new Map<string, CacheEntry<unknown>>();
let primaryExhausted = false;

function isSupportedFixture(item: unknown) {
  if (!item || typeof item !== "object") return false;
  const fixture = item as FixtureItem;
  return isSupportedLeague(fixture.league?.id, fixture.league?.name);
}

function localizeFixture(item: unknown) {
  if (!item || typeof item !== "object") return item;
  const fixture = item as FixtureItem;

  return {
    ...fixture,
    league: fixture.league
      ? {
          ...fixture.league,
          name: translateLeague(fixture.league.name ?? ""),
        }
      : fixture.league,
    teams: fixture.teams
      ? {
          ...fixture.teams,
          home: fixture.teams.home
            ? {
                ...fixture.teams.home,
                name: translateTeam(fixture.teams.home.name ?? ""),
              }
            : fixture.teams.home,
          away: fixture.teams.away
            ? {
                ...fixture.teams.away,
                name: translateTeam(fixture.teams.away.name ?? ""),
              }
            : fixture.teams.away,
        }
      : fixture.teams,
  };
}

function filterAndLocalizeFixtures<T extends FootballApiResponse>(data: T): T {
  if (!Array.isArray(data.response)) return data;

  const response = data.response.filter(isSupportedFixture).map(localizeFixture);
  return {
    ...data,
    response,
    results: response.length,
  };
}

function mapFdMatch(match: FallbackMatch) {
  const statusMap: Record<string, string> = {
    LIVE: "1H",
    IN_PLAY: "1H",
    PAUSED: "HT",
    FINISHED: "FT",
    SCHEDULED: "NS",
    TIMED: "NS",
    POSTPONED: "PST",
    CANCELLED: "CANC",
  };

  return {
    fixture: {
      id: match.id,
      date: match.utcDate,
      status: {
        short: statusMap[match.status] ?? "NS",
        elapsed: match.minute ?? null,
      },
    },
    league: {
      id: match.competition?.id ?? 0,
      name: match.competition?.name ?? "",
      round: match.matchday
        ? `Matchday ${match.matchday}`
        : "",
    },
    teams: {
      home: { name: match.homeTeam?.name ?? "", id: match.homeTeam?.id ?? 0 },
      away: { name: match.awayTeam?.name ?? "", id: match.awayTeam?.id ?? 0 },
    },
    goals: {
      home: match.score?.fullTime?.home ?? match.score?.halfTime?.home ?? 0,
      away: match.score?.fullTime?.away ?? match.score?.halfTime?.away ?? 0,
    },
  };
}

async function fetchFromFallback(
  path: "live" | "today",
  days = 0
): Promise<FootballApiResponse> {
  if (!FD_API_KEY) throw new Error("FOOTBALL_DATA_API_KEY 未配置");

  const today = beijingDateString();
  const rangeEnd = beijingDateString(days);

  const urls =
    path === "live"
      ? [`${FD_API_URL}/matches?status=LIVE`]
      : FALLBACK_COMPETITIONS.map(
          (code) =>
            `${FD_API_URL}/competitions/${code}/matches?dateFrom=${today}&dateTo=${rangeEnd}`
        );

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const res = await fetch(url, {
        headers: { "X-Auth-Token": FD_API_KEY },
        next: { revalidate: 300 },
      });

      if (!res.ok) throw new Error(`football-data.org 请求失败: ${res.status}`);
      return ((await res.json()) as { matches?: FallbackMatch[] }).matches ?? [];
    })
  );

  const matches = results
    .filter((result): result is PromiseFulfilledResult<FallbackMatch[]> => result.status === "fulfilled")
    .flatMap((result) => result.value);

  const seen = new Set<number>();
  const fixtures = matches
    .filter((match) => {
      if (seen.has(match.id)) return false;
      seen.add(match.id);
      return true;
    })
    .map(mapFdMatch);

  return filterAndLocalizeFixtures({
    response: fixtures,
    results: fixtures.length,
    errors: {},
  });
}

async function fetchWithCache<T extends FootballApiResponse>(
  key: string,
  path: string,
  searchParams?: Record<string, string | number>,
  ttl = CACHE_TTL_MS
) {
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && now - entry.timestamp < ttl) return entry.data as T;

  if (!API_KEY) throw new Error("FOOTBALL_API_KEY 未配置");

  const url = new URL(path, API_URL);
  if (searchParams) {
    Object.entries(searchParams).forEach(([paramKey, value]) => {
      url.searchParams.set(paramKey, String(value));
    });
  }

  const res = await fetch(url.toString(), {
    headers: { "x-apisports-key": API_KEY },
    next: { revalidate: 300 },
  });

  if (!res.ok) throw new Error(`Football API 请求失败: ${res.status}`);

  const json = (await res.json()) as T;
  const errors = json.errors;
  const hasApiErrors =
    Array.isArray(errors)
      ? errors.length > 0
      : !!errors && typeof errors === "object"
        ? Object.keys(errors).length > 0
        : Boolean(errors);

  if (hasApiErrors) {
    primaryExhausted = true;
    throw new Error("PRIMARY_EXHAUSTED");
  }

  cache.set(key, { data: json, timestamp: now });
  return json;
}

export async function getTodayMatches() {
  if (primaryExhausted) return fetchFromFallback("today");

  const today = beijingDateString();
  try {
    const data = await fetchWithCache<FootballApiResponse>("today:" + today, "/fixtures", {
      date: today,
      timezone: "Asia/Shanghai",
    });
    return filterAndLocalizeFixtures(data);
  } catch (error) {
    if (error instanceof Error && error.message === "PRIMARY_EXHAUSTED") {
      return fetchFromFallback("today");
    }
    throw error;
  }
}

export async function getLiveMatches() {
  if (primaryExhausted) return fetchFromFallback("live");

  try {
    const data = await fetchWithCache<FootballApiResponse>("live:all", "/fixtures", {
      live: "all",
      timezone: "Asia/Shanghai",
    });
    return filterAndLocalizeFixtures(data);
  } catch (error) {
    if (error instanceof Error && error.message === "PRIMARY_EXHAUSTED") {
      return fetchFromFallback("live");
    }
    throw error;
  }
}

export async function getFixtureById(fixtureId: number) {
  const data = await fetchWithCache<FootballApiResponse>(`fixture:${fixtureId}`, "/fixtures", {
    id: fixtureId,
  });
  return filterAndLocalizeFixtures(data);
}

export async function getMatchStatistics(fixtureId: number) {
  return fetchWithCache<FootballApiResponse>(`stats:${fixtureId}`, "/fixtures/statistics", {
    fixture: fixtureId,
  });
}

export async function getMatchOdds(fixtureId: number) {
  return fetchWithCache<FootballApiResponse>(`odds:${fixtureId}`, "/odds", {
    fixture: fixtureId,
  });
}

export async function getHeadToHead(team1Id: number, team2Id: number) {
  return fetchWithCache<FootballApiResponse>(`h2h:${team1Id}:${team2Id}`, "/fixtures/headtohead", {
    h2h: `${team1Id}-${team2Id}`,
  });
}

export async function getTeamRecentForm(teamId: number) {
  return fetchWithCache<FootballApiResponse>(`form:${teamId}`, "/fixtures", {
    team: teamId,
    last: 10,
  });
}

export async function getUpcomingMatches(days = 3) {
  const dates: string[] = [];
  for (let i = 1; i <= days; i += 1) {
    dates.push(beijingDateString(i));
  }

  if (primaryExhausted) return fetchFromFallback("today", days);

  const results = await Promise.allSettled(
    dates.map((date) =>
      fetchWithCache<FootballApiResponse>(
        `day:${date}`,
        "/fixtures",
        { date, timezone: "Asia/Shanghai" },
        UPCOMING_CACHE_TTL_MS
      )
    )
  );

  const exhausted = results.some(
    (result) =>
      result.status === "rejected" &&
      result.reason instanceof Error &&
      result.reason.message === "PRIMARY_EXHAUSTED"
  );

  if (exhausted) return fetchFromFallback("today", days);

  const response = results
    .filter((result): result is PromiseFulfilledResult<FootballApiResponse> => result.status === "fulfilled")
    .flatMap((result) => result.value.response ?? []);

  return filterAndLocalizeFixtures({ response, results: response.length, errors: {} });
}
