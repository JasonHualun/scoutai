import {
  isSupportedLeague,
  translateLeague,
  translateTeam,
} from "./league-translations";
import { numericIdFromTheStats, theStatsMatchIdCandidates } from "./thestats-ids";
import {
  fetchTheStatsJson,
  isTheStatsStrictMode,
  shouldAttemptTheStats,
} from "./thestats-api";
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

type FixtureFilterOptions = {
  includeUnsupported?: boolean;
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
  odds_available?: boolean;
  live_odds_available?: boolean;
  xg_available?: boolean;
};

type TheStatsMatchesPayload = {
  data?: TheStatsMatch[];
};

type TheStatsMatchPayload = {
  data?: TheStatsMatch;
};

type TheStatsMetric = {
  all?: { home?: number | null; away?: number | null } | null;
  first_half?: { home?: number | null; away?: number | null } | null;
  second_half?: { home?: number | null; away?: number | null } | null;
};

type TheStatsMetricGroup = Record<string, TheStatsMetric | undefined>;

type TheStatsStatsOverview = TheStatsMetricGroup & {
  ball_possession?: TheStatsMetric;
  expected_goals?: TheStatsMetric;
  big_chances?: TheStatsMetric;
  total_shots?: TheStatsMetric;
  shots_on_target?: TheStatsMetric;
  corner_kicks?: TheStatsMetric;
  fouls?: TheStatsMetric;
  yellow_cards?: TheStatsMetric;
  red_cards?: TheStatsMetric;
  passes?: TheStatsMetric;
  goalkeeper_saves?: TheStatsMetric;
};

type TheStatsStatsPayload = {
  data?: {
    overview?: TheStatsStatsOverview;
    shots?: TheStatsMetricGroup;
    attack?: TheStatsMetricGroup;
    passes?: TheStatsMetricGroup;
    goalkeeping?: TheStatsMetricGroup;
    np_expected_goals?: TheStatsMetric;
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

type TheStatsMatchOdds = NonNullable<
  NonNullable<
    NonNullable<NonNullable<TheStatsOddsPayload["data"]>["bookmakers"]>[number]["markets"]
  >["match_odds"]
>;

type TheStatsOddsSnapshot = "opening" | "last_seen" | "live";

type TheStatsCoverageOverrides = {
  statsAvailable?: boolean;
};

const CACHE_TTL_MS = 60 * 1000;
const UPCOMING_CACHE_TTL_MS = 10 * 60 * 1000;
const FALLBACK_COMPETITIONS = ["PL", "PD", "BL1", "SA", "FL1", "WC"];

const cache = new Map<string, CacheEntry<unknown>>();
let primaryExhausted = false;

function shouldUseTheStats() {
  return shouldAttemptTheStats();
}

function throwIfTheStatsStrict(error: unknown) {
  if (isTheStatsStrictMode()) throw error;
}

async function fetchTheStatsMatchResource<T>(
  fixtureId: number | string,
  pathForMatchId: (matchId: string) => string,
  revalidate: number
) {
  let lastError: unknown = null;

  for (const matchId of theStatsMatchIdCandidates(fixtureId)) {
    try {
      return await fetchTheStatsJson<T>({
        path: pathForMatchId(matchId),
        revalidate,
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("TheStats match resource not found");
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
    comp_29967: { id: 29967, name: "International Friendly Games" },
    comp_6059: { id: 6059, name: "Vietnam V.League 1" },
    comp_8998: { id: 8998, name: "Uruguay Primera Division" },
    comp_30610: { id: 30610, name: "Morocco Botola Pro" },
    comp_623699: { id: 623699, name: "Bolivia Primera Division" },
    comp_1085: { id: 1085, name: "Brazil Serie B" },
    comp_194097: { id: 194097, name: "Canadian Premier League" },
  };
  const mapped = match.competition_id ? byId[match.competition_id] : null;
  const name =
    match.competition_name ||
    mapped?.name ||
    (match.competition_id ? `测试赛事 ${match.competition_id}` : "");
  return {
    id:
      mapped?.id ??
      (leagueIdFromTheStatsName(name) || numericIdFromTheStats(match.competition_id)),
    name,
  };
}

function isTheStatsFriendly(match: TheStatsMatch) {
  const name = `${match.competition_name ?? ""} ${match.competition_id ?? ""}`.toLowerCase();
  return (
    match.competition_id === "comp_29967" ||
    name.includes("friendly") ||
    name.includes("friendlies") ||
    name.includes("友谊")
  );
}

function statusFromTheStats(status?: string) {
  if (status === "live") return "1H";
  if (status === "finished") return "FT";
  if (status === "postponed") return "PST";
  if (status === "cancelled") return "CANC";
  return "NS";
}

function isTheStatsActiveBoardMatch(match: TheStatsMatch) {
  return !["FT", "PST", "CANC", "ABD", "AWD", "WO"].includes(statusFromTheStats(match.status));
}

function mapTheStatsMatch(match: TheStatsMatch, coverageOverrides: TheStatsCoverageOverrides = {}) {
  const competition = leagueMetaFromTheStats(match);
  const isFriendly = isTheStatsFriendly(match);
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
    coverage: {
      provider: "thestats",
      providerMatchId: match.id ?? null,
      oddsAvailable: Boolean(match.odds_available),
      liveOddsAvailable: Boolean(match.live_odds_available),
      xgAvailable: Boolean(match.xg_available),
      statsAvailable: coverageOverrides.statsAvailable ?? Boolean(match.xg_available),
      isCoreLeague: isSupportedLeague(competition.id, competition.name),
      isFriendly,
    },
  };
}

function hasMetricPair(metric?: TheStatsMetric) {
  const values = metric?.all;
  return Boolean(values && (values.home !== null && values.home !== undefined || values.away !== null && values.away !== undefined));
}

function hasTheStatsStats(payload: TheStatsStatsPayload | null) {
  const data = payload?.data;
  const overview = payload?.data?.overview;
  if (!data || !overview) return false;

  return [
    overview.ball_possession,
    overview.expected_goals,
    overview.big_chances,
    overview.total_shots,
    overview.shots_on_target,
    overview.corner_kicks,
    overview.fouls,
    overview.yellow_cards,
    overview.red_cards,
    overview.passes,
    overview.goalkeeper_saves,
    data.np_expected_goals,
    data.shots?.shots_off_target,
    data.attack?.touches_in_penalty_area,
    data.attack?.offsides,
    data.passes?.final_third_entries,
    data.goalkeeping?.saves,
  ].some(hasMetricPair);
}

async function fetchTheStatsStatsPayload(matchId: string | number | null | undefined) {
  let lastError: unknown = null;
  let firstPayload: TheStatsStatsPayload | null = null;

  for (const candidate of theStatsMatchIdCandidates(matchId)) {
    try {
      const payload = await fetchTheStatsJson<TheStatsStatsPayload>({
        path: `/football/matches/${candidate}/stats`,
        revalidate: 180,
      });
      firstPayload = firstPayload ?? payload;
      if (hasTheStatsStats(payload)) return payload;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return firstPayload;
}

async function filterTheStatsMatchesWithActualStats(matches: TheStatsMatch[], maxChecks: number) {
  const covered: TheStatsMatch[] = [];

  for (const match of matches.slice(0, maxChecks)) {
    try {
      if (hasTheStatsStats(await fetchTheStatsStatsPayload(match.id))) {
        covered.push(match);
      }
    } catch (error) {
      console.error("[thestats] stats preflight failed:", error);
    }
  }

  return covered;
}

async function fetchTheStatsMatches(
  query: Record<string, string | number>,
  options: FixtureFilterOptions & {
    onlyFriendlies?: boolean;
    requireOdds?: boolean;
    requireStats?: boolean;
    activeOnly?: boolean;
    maxStatChecks?: number;
    maxPages?: number;
  } = {}
) {
  const perPage = 100;
  const matches: TheStatsMatch[] = [];
  const maxPages = options.maxPages ?? 4;

  for (let page = 1; page <= maxPages; page += 1) {
    const payload = await fetchTheStatsJson<TheStatsMatchesPayload>({
      path: "/football/matches",
      query: { page, per_page: perPage, utc_offset: "+08:00", ...query },
      revalidate: 180,
    });
    const pageMatches = payload.data ?? [];
    matches.push(...pageMatches);
    if (pageMatches.length < perPage) break;
  }

  const filteredMatches = matches
    .filter((match) =>
      options.requireOdds
        ? Boolean(match.odds_available || match.live_odds_available)
        : true
    )
    .filter((match) => (options.onlyFriendlies ? isTheStatsFriendly(match) : true))
    .filter((match) => (options.activeOnly ? isTheStatsActiveBoardMatch(match) : true))
    .sort(
      (a, b) =>
        new Date(a.utc_date ?? 0).getTime() - new Date(b.utc_date ?? 0).getTime()
    );

  const coveredMatches = options.requireStats
    ? await filterTheStatsMatchesWithActualStats(filteredMatches, options.maxStatChecks ?? 12)
    : filteredMatches;

  const fixtures = coveredMatches
    .map((match) =>
      mapTheStatsMatch(match, {
        statsAvailable: options.requireStats ? true : Boolean(match.xg_available),
      })
    )
    .filter((fixture) => fixture.fixture.id > 0)
    .sort(
      (a, b) =>
        new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime()
    );
  return filterAndLocalizeFixtures({
    response: fixtures,
    results: fixtures.length,
    errors: {},
  }, options);
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

function oddsAt(value: TheStatsOddsValue | undefined, snapshot: TheStatsOddsSnapshot) {
  const parsed = safeNumber(value?.[snapshot]);
  return parsed > 1 ? parsed : 0;
}

function impliedFromMatchOdds(
  matchOdds: TheStatsMatchOdds | undefined,
  snapshot: TheStatsOddsSnapshot
) {
  const odds = {
    homeWin: oddsAt(matchOdds?.home, snapshot),
    draw: oddsAt(matchOdds?.draw, snapshot),
    awayWin: oddsAt(matchOdds?.away, snapshot),
  };

  if (!odds.homeWin || !odds.draw || !odds.awayWin) return null;

  const raw = {
    homeWin: 1 / odds.homeWin,
    draw: 1 / odds.draw,
    awayWin: 1 / odds.awayWin,
  };
  const total = raw.homeWin + raw.draw + raw.awayWin;
  if (!Number.isFinite(total) || total <= 0) return null;

  return {
    odds,
    overroundPercent: Math.round((total - 1) * 1000) / 10,
    noVig: {
      homeWin: Math.round((raw.homeWin / total) * 1000) / 10,
      draw: Math.round((raw.draw / total) * 1000) / 10,
      awayWin: Math.round((raw.awayWin / total) * 1000) / 10,
    },
  };
}

function pressureLabel(
  latest: NonNullable<ReturnType<typeof impliedFromMatchOdds>>["noVig"] | null,
  opening: NonNullable<ReturnType<typeof impliedFromMatchOdds>>["noVig"] | null
) {
  if (!latest || !opening) return "等待更多盘口变化";

  const labels = {
    homeWin: "主胜",
    draw: "平局",
    awayWin: "客胜",
  } as const;
  const shifts = (Object.keys(labels) as Array<keyof typeof labels>).map((key) => ({
    key,
    shift: Math.round((latest[key] - opening[key]) * 10) / 10,
  }));
  const strongest = shifts.sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift))[0];
  if (!strongest || Math.abs(strongest.shift) < 0.8) return "盘口整体平稳";

  return `${labels[strongest.key]}方向${strongest.shift > 0 ? "升温" : "降温"} ${
    strongest.shift > 0 ? "+" : ""
  }${strongest.shift}%`;
}

function marketSpread(bookmakers: NonNullable<TheStatsOddsPayload["data"]>["bookmakers"]) {
  const snapshots = (bookmakers ?? [])
    .map((bookmaker) => impliedFromMatchOdds(bookmaker.markets?.match_odds, "last_seen"))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (snapshots.length < 2) return null;

  const outcomes = ["homeWin", "draw", "awayWin"] as const;
  const spread = Math.max(
    ...outcomes.map((outcome) => {
      const values = snapshots.map((snapshot) => snapshot.noVig[outcome]);
      return Math.max(...values) - Math.min(...values);
    })
  );

  return Math.round(spread * 10) / 10;
}

function exchangeLean(payload: TheStatsOddsPayload | null) {
  const bookmakers = payload?.data?.bookmakers ?? [];
  const exchange = bookmakers.find((bookmaker) => bookmaker.bookmaker === "Betfair Exchange");
  const sharp =
    bookmakers.find((bookmaker) => bookmaker.bookmaker === "Pinnacle") ??
    bookmakers.find((bookmaker) => bookmaker.bookmaker !== "Betfair Exchange");

  const exchangeNoVig = impliedFromMatchOdds(exchange?.markets?.match_odds, "last_seen")?.noVig;
  const sharpNoVig = impliedFromMatchOdds(sharp?.markets?.match_odds, "last_seen")?.noVig;
  if (!exchangeNoVig || !sharpNoVig) return null;

  const labels = {
    homeWin: "主胜",
    draw: "平局",
    awayWin: "客胜",
  } as const;
  const diffs = (Object.keys(labels) as Array<keyof typeof labels>).map((key) => ({
    key,
    diff: Math.round((exchangeNoVig[key] - sharpNoVig[key]) * 10) / 10,
  }));
  const strongest = diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0];
  if (!strongest || Math.abs(strongest.diff) < 1) return "交易所与锐利盘口接近";

  return `交易所更偏${labels[strongest.key]} ${strongest.diff > 0 ? "+" : ""}${strongest.diff}%`;
}

export async function getMatchMarketSignals(fixtureId: number | string) {
  if (!shouldUseTheStats()) return null;

  try {
    let payload: TheStatsOddsPayload | null = null;
    for (const matchId of theStatsMatchIdCandidates(fixtureId)) {
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
      payload =
        liveOddsRes.status === "fulfilled"
          ? liveOddsRes.value
          : oddsRes.status === "fulfilled"
            ? oddsRes.value
            : null;
      if ((payload?.data?.bookmakers ?? []).length > 0) break;
    }
    const bookmakers = payload?.data?.bookmakers ?? [];
    if (bookmakers.length === 0) return null;

    const primary = chooseTheStatsBookmaker(payload);
    const latest = impliedFromMatchOdds(primary?.markets?.match_odds, "last_seen");
    const opening = impliedFromMatchOdds(primary?.markets?.match_odds, "opening");
    const live = impliedFromMatchOdds(primary?.markets?.match_odds, "live");

    return {
      source: primary?.bookmaker ?? "TheStats",
      availableBooks: bookmakers.map((bookmaker) => bookmaker.bookmaker).filter(Boolean),
      overroundPercent: live?.overroundPercent ?? latest?.overroundPercent ?? null,
      noVig: live?.noVig ?? latest?.noVig ?? null,
      openingNoVig: opening?.noVig ?? null,
      pressure: pressureLabel(live?.noVig ?? latest?.noVig ?? null, opening?.noVig ?? null),
      exchangeLean: exchangeLean(payload),
      bookmakerSpreadPercent: marketSpread(bookmakers),
      note: "由开盘、即时/最新赔率、去水概率和交易所价格推断市场倾向。",
    };
    } catch (error) {
      console.error("[thestats] market signals failed:", error);
      throwIfTheStatsStrict(error);
      return null;
    }
}

function metricAll(metric?: TheStatsMetric) {
  return metric?.all ?? {};
}

function overviewMetric(payload: TheStatsStatsPayload | null, key: string) {
  return metricAll(payload?.data?.overview?.[key]);
}

function sectionMetric(
  payload: TheStatsStatsPayload | null,
  section: "shots" | "attack" | "passes" | "goalkeeping",
  key: string
) {
  return metricAll(payload?.data?.[section]?.[key]);
}

function rootMetric(payload: TheStatsStatsPayload | null, key: "np_expected_goals") {
  return metricAll(payload?.data?.[key]);
}

function hasAnyMetricValue(values: { home?: number | null; away?: number | null }) {
  return values.home !== null && values.home !== undefined || values.away !== null && values.away !== undefined;
}

function preferMetric(
  ...metrics: Array<{ home?: number | null; away?: number | null }>
) {
  return metrics.find(hasAnyMetricValue) ?? {};
}

function preferPositiveMetric(
  primary: { home?: number | null; away?: number | null },
  fallback: { home?: number | null; away?: number | null }
) {
  const primaryHome = safeNumber(primary.home);
  const primaryAway = safeNumber(primary.away);
  return primaryHome > 0 || primaryAway > 0 ? primary : fallback;
}

function metricSideValue(
  values: { home?: number | null; away?: number | null },
  side: "home" | "away"
) {
  const parsed = Number(values[side]);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapTheStatsStats(payload: TheStatsStatsPayload | null, fixture: ReturnType<typeof mapTheStatsMatch>) {
  const possession = overviewMetric(payload, "ball_possession");
  const xg = preferPositiveMetric(
    overviewMetric(payload, "expected_goals"),
    rootMetric(payload, "np_expected_goals")
  );
  const shots = overviewMetric(payload, "total_shots");
  const shotsOnTarget = overviewMetric(payload, "shots_on_target");
  const shotsOffTarget = sectionMetric(payload, "shots", "shots_off_target");
  const corners = overviewMetric(payload, "corner_kicks");
  const yellows = overviewMetric(payload, "yellow_cards");
  const reds = overviewMetric(payload, "red_cards");
  const fouls = overviewMetric(payload, "fouls");
  const bigChances = overviewMetric(payload, "big_chances");
  const passes = overviewMetric(payload, "passes");
  const saves = preferMetric(
    overviewMetric(payload, "goalkeeper_saves"),
    sectionMetric(payload, "goalkeeping", "saves")
  );
  const touchesInBox = sectionMetric(payload, "attack", "touches_in_penalty_area");
  const dangerousAttacks = preferMetric(
    overviewMetric(payload, "dangerous_attacks"),
    sectionMetric(payload, "passes", "final_third_entries"),
    touchesInBox
  );

  const makeStats = (side: "home" | "away") => [
    { type: "Ball Possession", value: metricSideValue(possession, side) },
    { type: "Total Shots", value: metricSideValue(shots, side) },
    { type: "Shots on Target", value: metricSideValue(shotsOnTarget, side) },
    { type: "Shots off Target", value: metricSideValue(shotsOffTarget, side) },
    { type: "Corner Kicks", value: metricSideValue(corners, side) },
    { type: "Yellow Cards", value: metricSideValue(yellows, side) },
    { type: "Red Cards", value: metricSideValue(reds, side) },
    { type: "Expected Goals", value: metricSideValue(xg, side) },
    { type: "Big Chances", value: metricSideValue(bigChances, side) },
    { type: "Dangerous Attacks", value: metricSideValue(dangerousAttacks, side) },
    { type: "Touches in Box", value: metricSideValue(touchesInBox, side) },
    { type: "Fouls", value: metricSideValue(fouls, side) },
    { type: "Passes", value: metricSideValue(passes, side) },
    { type: "Goalkeeper Saves", value: metricSideValue(saves, side) },
  ];

  return {
    response: [
      {
        team: {
          ...fixture.teams.home,
          name: translateTeam(fixture.teams.home.name ?? ""),
        },
        statistics: makeStats("home"),
      },
      {
        team: {
          ...fixture.teams.away,
          name: translateTeam(fixture.teams.away.name ?? ""),
        },
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

function filterAndLocalizeFixtures<T extends FootballApiResponse>(
  data: T,
  options: FixtureFilterOptions = {}
): T {
  if (!Array.isArray(data.response)) return data;

  const response = data.response
    .filter((fixture) => options.includeUnsupported || isSupportedFixture(fixture))
    .map(localizeFixture);
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
      throwIfTheStatsStrict(error);
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
      throwIfTheStatsStrict(error);
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

export async function getFixtureById(fixtureId: number | string) {
  if (shouldUseTheStats()) {
    try {
      const payload = await fetchTheStatsMatchResource<TheStatsMatchPayload>(
        fixtureId,
        (matchId) => `/football/matches/${matchId}`,
        30
      );
      if (payload.data) {
        const fixture = mapTheStatsMatch(payload.data);
        return filterAndLocalizeFixtures({
          response: [fixture],
          results: 1,
          errors: {},
        }, { includeUnsupported: true });
      }
      if (isTheStatsStrictMode()) {
        throw new Error("TheStats 没有返回比赛基础信息");
      }
    } catch (error) {
      console.error("[thestats] fixture failed:", error);
      throwIfTheStatsStrict(error);
    }
  }

  const numericFixtureId = numericIdFromTheStats(String(fixtureId));
  const data = await fetchWithCache<FootballApiResponse>(`fixture:${numericFixtureId}`, "/fixtures", {
    id: numericFixtureId,
  });
  return filterAndLocalizeFixtures(data);
}

export async function getMatchStatistics(fixtureId: number | string) {
  if (shouldUseTheStats()) {
    try {
      let lastError: unknown = null;
      for (const matchId of theStatsMatchIdCandidates(fixtureId)) {
        try {
          const [matchPayload, statsPayload] = await Promise.all([
            fetchTheStatsJson<TheStatsMatchPayload>({
              path: `/football/matches/${matchId}`,
              revalidate: 30,
            }),
            fetchTheStatsStatsPayload(matchId),
          ]);
          if (matchPayload.data && hasTheStatsStats(statsPayload)) {
            return mapTheStatsStats(statsPayload, mapTheStatsMatch(matchPayload.data));
          }
        } catch (error) {
          lastError = error;
        }
      }
      if (lastError) throw lastError;
    } catch (error) {
      console.error("[thestats] stats failed:", error);
      throwIfTheStatsStrict(error);
    }
    return {
      response: [],
      results: 0,
      errors: {},
    };
  }

  return fetchWithCache<FootballApiResponse>(`stats:${fixtureId}`, "/fixtures/statistics", {
    fixture: fixtureId,
  });
}

export async function getMatchOdds(fixtureId: number | string) {
  if (shouldUseTheStats()) {
    try {
      for (const matchId of theStatsMatchIdCandidates(fixtureId)) {
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
      }
    } catch (error) {
      console.error("[thestats] odds failed:", error);
      throwIfTheStatsStrict(error);
    }
    if (isTheStatsStrictMode()) {
      throw new Error("TheStats 暂未返回比赛赔率");
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
      throwIfTheStatsStrict(error);
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

export async function getMarketTestMatches(days = 7) {
  if (!shouldUseTheStats()) {
    return {
      response: [],
      results: 0,
      errors: {},
    };
  }

  try {
    return await fetchTheStatsMatches(
      {
        date_from: beijingDateString(),
        date_to: beijingDateString(days),
        competition_id: "comp_29967",
      },
      {
        includeUnsupported: true,
        onlyFriendlies: true,
        requireOdds: false,
        requireStats: false,
        activeOnly: true,
        maxPages: 8,
      }
    );
  } catch (error) {
    console.error("[thestats] market test matches failed:", error);
    throwIfTheStatsStrict(error);
    return {
      response: [],
      results: 0,
      errors: {},
    };
  }
}
