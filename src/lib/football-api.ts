import {
  isSupportedLeague,
  translateLeague,
  translateTeam,
} from "./league-translations";
import { fetchTheStatsJson, theStatsConfigStatus } from "./thestats-api";
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

type TheStatsMatch = {
  id?: string;
  competition_id?: string | null;
  competition_name?: string | null;
  matchday?: number | null;
  status?: string;
  utc_date?: string | null;
  home_team?: { id?: string; name?: string };
  away_team?: { id?: string; name?: string };
  score?: { home?: number | null; away?: number | null };
  live_odds_available?: boolean;
};

type TheStatsMatchesPayload = {
  data?: TheStatsMatch[];
};

type TheStatsMatchPayload = {
  data?: TheStatsMatch;
};

type TheStatsMetric = {
  all?: { home?: number | null; away?: number | null };
};

type TheStatsStatsPayload = {
  data?: {
    overview?: {
      ball_possession?: TheStatsMetric;
      expected_goals?: TheStatsMetric;
      total_shots?: TheStatsMetric;
      shots_on_target?: TheStatsMetric;
      corner_kicks?: TheStatsMetric;
      yellow_cards?: TheStatsMetric;
    };
  };
};

type TheStatsOddsValue = {
  opening?: string | number | null;
  last_seen?: string | number | null;
  live?: string | number | null;
};

type TheStatsOddsPayload = {
  data?: {
    bookmakers?: Array<{
      bookmaker?: string;
      markets?: {
        match_odds?: {
          home?: TheStatsOddsValue;
          draw?: TheStatsOddsValue;
          away?: TheStatsOddsValue;
        };
        total_goals?: Record<
          string,
          { over?: TheStatsOddsValue; under?: TheStatsOddsValue }
        >;
        asian_handicap?: {
          home?: Record<string, TheStatsOddsValue>;
          away?: Record<string, TheStatsOddsValue>;
        };
      };
    }>;
  };
};

const CACHE_TTL_MS = 60 * 1000;
const UPCOMING_CACHE_TTL_MS = 10 * 60 * 1000;
const FALLBACK_COMPETITIONS = ["PL", "PD", "BL1", "SA", "FL1", "WC"];

const cache = new Map<string, CacheEntry<unknown>>();
let primaryExhausted = false;

function shouldUseTheStats() {
  return theStatsConfigStatus().configured;
}

function numericIdFromTheStats(id?: string | null) {
  const numeric = Number(String(id ?? "").replace(/\D/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function theStatsIdFromNumeric(id: number) {
  return `mt_${Math.round(id)}`;
}

function leagueIdFromTheStatsName(name?: string | null) {
  const normalized = (name ?? "").toLowerCase();
  if (normalized.includes("premier league")) return 39;
  if (normalized.includes("la liga") || normalized.includes("laliga")) return 140;
  if (normalized.includes("bundesliga")) return 78;
  if (normalized.includes("serie a")) return 135;
  if (normalized.includes("ligue 1")) return 61;
  if (normalized.includes("world cup")) return 1;
  return 0;
}

function leagueMetaFromTheStats(match: TheStatsMatch) {
  const byId: Record<string, { id: number; name: string }> = {
    comp_3039: { id: 39, name: "Premier League" },
    comp_8814: { id: 140, name: "LaLiga" },
    comp_4643: { id: 78, name: "Bundesliga" },
    comp_5840: { id: 135, name: "Serie A" },
    comp_0256: { id: 61, name: "Ligue 1" },
    comp_6107: { id: 1, name: "FIFA World Cup" },
  };
  const mapped = match.competition_id ? byId[match.competition_id] : null;
  const name = match.competition_name || mapped?.name || "";
  return {
    id: mapped?.id ?? leagueIdFromTheStatsName(name),
    name,
  };
}

function statusFromTheStats(status?: string) {
  if (status === "live") return "1H";
  if (status === "finished") return "FT";
  if (status === "postponed") return "PST";
  if (status === "cancelled") return "CANC";
  return "NS";
}

function mapTheStatsMatch(match: TheStatsMatch) {
  const competition = leagueMetaFromTheStats(match);
  return {
    fixture: {
      id: numericIdFromTheStats(match.id),
      date: match.utc_date ?? new Date().toISOString(),
      status: {
        short: statusFromTheStats(match.status),
        elapsed: null,
      },
    },
    league: {
      id: competition.id,
      name: competition.name,
      round: match.matchday ? `第 ${match.matchday} 轮` : "",
    },
    teams: {
      home: {
        id: numericIdFromTheStats(match.home_team?.id),
        name: match.home_team?.name ?? "",
      },
      away: {
        id: numericIdFromTheStats(match.away_team?.id),
        name: match.away_team?.name ?? "",
      },
    },
    goals: {
      home: match.score?.home ?? 0,
      away: match.score?.away ?? 0,
    },
  };
}

async function fetchTheStatsMatches(query: Record<string, string | number>) {
  const payload = await fetchTheStatsJson<TheStatsMatchesPayload>({
    path: "/football/matches",
    query: { page: 1, per_page: 100, utc_offset: "+08:00", ...query },
    revalidate: 180,
  });
  const fixtures = (payload.data ?? [])
    .map(mapTheStatsMatch)
    .filter((fixture) => fixture.fixture.id > 0);
  return filterAndLocalizeFixtures({
    response: fixtures,
    results: fixtures.length,
    errors: {},
  });
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function latestOdd(value?: TheStatsOddsValue) {
  const parsed = safeNumber(value?.live ?? value?.last_seen ?? value?.opening);
  return parsed > 1 ? parsed : 0;
}

function chooseTheStatsBookmaker(payload: TheStatsOddsPayload | null) {
  const bookmakers = payload?.data?.bookmakers ?? [];
  const priority = ["Pinnacle", "Bet365", "Betfair Exchange", "Kambi"];
  return (
    priority
      .map((name) => bookmakers.find((bookmaker) => bookmaker.bookmaker === name))
      .find(Boolean) ?? bookmakers[0]
  );
}

function firstClosestLine<T>(lines: Record<string, T> | undefined, target = 2.5) {
  const keys = Object.keys(lines ?? {});
  if (keys.length === 0) return null;
  return keys.sort((a, b) => Math.abs(Number(a) - target) - Math.abs(Number(b) - target))[0];
}

function mapTheStatsOdds(payload: TheStatsOddsPayload | null) {
  const bookmaker = chooseTheStatsBookmaker(payload);
  const markets = bookmaker?.markets;
  const matchOdds = markets?.match_odds;
  const totalLine = firstClosestLine(markets?.total_goals);
  const handicapLine = firstClosestLine(markets?.asian_handicap?.home, 0);

  return {
    response: [
      {
        bookmakers: [
          {
            bets: [
              {
                name: "Match Winner",
                values: [
                  { value: "Home", odd: String(latestOdd(matchOdds?.home) || "") },
                  { value: "Draw", odd: String(latestOdd(matchOdds?.draw) || "") },
                  { value: "Away", odd: String(latestOdd(matchOdds?.away) || "") },
                ],
              },
              {
                name: "Goals Over/Under",
                values: totalLine
                  ? [
                      {
                        value: `Over ${totalLine}`,
                        odd: String(latestOdd(markets?.total_goals?.[totalLine]?.over) || ""),
                      },
                      {
                        value: `Under ${totalLine}`,
                        odd: String(latestOdd(markets?.total_goals?.[totalLine]?.under) || ""),
                      },
                    ]
                  : [],
              },
              {
                name: "Asian Handicap",
                values: handicapLine
                  ? [
                      {
                        value: `Home ${handicapLine}`,
                        odd: String(latestOdd(markets?.asian_handicap?.home?.[handicapLine]) || ""),
                      },
                    ]
                  : [],
              },
            ],
          },
        ],
      },
    ],
    results: 1,
    errors: {},
  };
}

function metric(payload: TheStatsStatsPayload | null, key: keyof NonNullable<NonNullable<TheStatsStatsPayload["data"]>["overview"]>) {
  return payload?.data?.overview?.[key]?.all ?? {};
}

function mapTheStatsStats(payload: TheStatsStatsPayload | null, fixture: ReturnType<typeof mapTheStatsMatch>) {
  const possession = metric(payload, "ball_possession");
  const xg = metric(payload, "expected_goals");
  const shots = metric(payload, "total_shots");
  const shotsOnTarget = metric(payload, "shots_on_target");
  const corners = metric(payload, "corner_kicks");
  const yellows = metric(payload, "yellow_cards");

  const makeStats = (side: "home" | "away") => [
    { type: "Ball Possession", value: safeNumber(possession[side], 50) },
    { type: "Total Shots", value: safeNumber(shots[side]) },
    { type: "Shots on Target", value: safeNumber(shotsOnTarget[side]) },
    { type: "Corner Kicks", value: safeNumber(corners[side]) },
    { type: "Yellow Cards", value: safeNumber(yellows[side]) },
    { type: "Expected Goals", value: safeNumber(xg[side]) },
  ];

  return {
    response: [
      {
        team: fixture.teams.home,
        statistics: makeStats("home"),
      },
      {
        team: fixture.teams.away,
        statistics: makeStats("away"),
      },
    ],
    results: 2,
    errors: {},
  };
}

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
  if (shouldUseTheStats()) {
    try {
      const today = beijingDateString();
      return await fetchTheStatsMatches({
        date_from: today,
        date_to: today,
      });
    } catch (error) {
      console.error("[thestats] today matches failed:", error);
    }
  }

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
  if (shouldUseTheStats()) {
    try {
      return await fetchTheStatsMatches({ status: "live" });
    } catch (error) {
      console.error("[thestats] live matches failed:", error);
    }
  }

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
  if (shouldUseTheStats()) {
    try {
      const payload = await fetchTheStatsJson<TheStatsMatchPayload>({
        path: `/football/matches/${theStatsIdFromNumeric(fixtureId)}`,
        revalidate: 120,
      });
      if (payload.data) {
        const fixture = mapTheStatsMatch(payload.data);
        return filterAndLocalizeFixtures({
          response: [fixture],
          results: 1,
          errors: {},
        });
      }
    } catch (error) {
      console.error("[thestats] fixture failed:", error);
    }
  }

  const data = await fetchWithCache<FootballApiResponse>(`fixture:${fixtureId}`, "/fixtures", {
    id: fixtureId,
  });
  return filterAndLocalizeFixtures(data);
}

export async function getMatchStatistics(fixtureId: number) {
  if (shouldUseTheStats()) {
    try {
      const [matchPayload, statsPayload] = await Promise.all([
        fetchTheStatsJson<TheStatsMatchPayload>({
          path: `/football/matches/${theStatsIdFromNumeric(fixtureId)}`,
          revalidate: 120,
        }),
        fetchTheStatsJson<TheStatsStatsPayload>({
          path: `/football/matches/${theStatsIdFromNumeric(fixtureId)}/stats`,
          revalidate: 120,
        }),
      ]);
      if (matchPayload.data) {
        return mapTheStatsStats(statsPayload, mapTheStatsMatch(matchPayload.data));
      }
    } catch (error) {
      console.error("[thestats] stats failed:", error);
    }
  }

  return fetchWithCache<FootballApiResponse>(`stats:${fixtureId}`, "/fixtures/statistics", {
    fixture: fixtureId,
  });
}

export async function getMatchOdds(fixtureId: number) {
  if (shouldUseTheStats()) {
    try {
      const matchId = theStatsIdFromNumeric(fixtureId);
      const [liveOddsRes, oddsRes] = await Promise.allSettled([
        fetchTheStatsJson<TheStatsOddsPayload>({
          path: `/football/matches/${matchId}/odds/live`,
          revalidate: 30,
        }),
        fetchTheStatsJson<TheStatsOddsPayload>({
          path: `/football/matches/${matchId}/odds`,
          revalidate: 300,
        }),
      ]);
      const payload =
        liveOddsRes.status === "fulfilled"
          ? liveOddsRes.value
          : oddsRes.status === "fulfilled"
            ? oddsRes.value
            : null;
      if (payload) return mapTheStatsOdds(payload);
    } catch (error) {
      console.error("[thestats] odds failed:", error);
    }
  }

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
  if (shouldUseTheStats()) {
    return {
      response: [],
      results: 0,
      errors: {},
    };
  }

  return fetchWithCache<FootballApiResponse>(`form:${teamId}`, "/fixtures", {
    team: teamId,
    last: 10,
  });
}

export async function getUpcomingMatches(days = 3) {
  if (shouldUseTheStats()) {
    try {
      return await fetchTheStatsMatches({
        date_from: beijingDateString(1),
        date_to: beijingDateString(days),
        status: "scheduled",
      });
    } catch (error) {
      console.error("[thestats] upcoming matches failed:", error);
    }
  }

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
