const API_URL = process.env.FOOTBALL_API_URL || "https://v3.football.api-sports.io";
const API_KEY = process.env.FOOTBALL_API_KEY;

const FD_API_URL = "https://api.football-data.org/v4";
const FD_API_KEY = process.env.FOOTBALL_DATA_API_KEY;

type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

const CACHE_TTL_MS = 60 * 1000;
const UPCOMING_CACHE_TTL_MS = 10 * 60 * 1000; // 未来赛事缓存 10 分钟

const cache = new Map<string, CacheEntry<any>>();

// 主 API 额度耗尽标记
let primaryExhausted = false;

// 将 football-data.org 的 match 对象转换成与 api-football response[] 元素一致的结构
function mapFdMatch(match: any) {
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
  const result = {
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
      round: match.season?.currentMatchday ? `Matchday ${match.season.currentMatchday}` : "",
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
  console.log('[mapFdMatch] mapped result:', JSON.stringify(result).slice(0, 200));
  return result;
}

async function fetchFromFallback(path: "live" | "today"): Promise<any> {
  if (!FD_API_KEY) throw new Error("FOOTBALL_DATA_API_KEY 未配置");

  const today = new Date().toISOString().split('T')[0];
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const url =
    path === "live"
      ? `${FD_API_URL}/matches?status=LIVE`
      : `${FD_API_URL}/matches?dateFrom=${today}&dateTo=${nextWeek}`;

  console.log(`[fallback] Fetching from football-data.org: ${url}`);

  const res = await fetch(url, {
    headers: { "X-Auth-Token": FD_API_KEY },
    next: { revalidate: 300 },
  });

  console.log('[fallback] response status:', res.status);
  const text = await res.text();
  console.log('[fallback] response body:', text.slice(0, 500));

  if (!res.ok) throw new Error(`football-data.org 请求失败: ${res.status}`);

  const json = JSON.parse(text);
  const matches: any[] = json.matches ?? [];
  console.log('[fallback] matches count:', json?.matches?.length);
  console.log('[fallback] first match:', JSON.stringify(json?.matches?.[0])?.slice(0, 300));
  const seen = new Set<number>();
  const uniqueMatches = matches.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
  const fixtures = uniqueMatches.map(mapFdMatch);
  console.log('[fallback] mapped fixtures count:', fixtures.length);
  return { response: fixtures, results: fixtures.length, errors: {} };
}

async function fetchWithCache<T>(key: string, path: string, searchParams?: Record<string, string | number>, ttl = CACHE_TTL_MS) {
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && now - entry.timestamp < ttl) {
    return entry.data as T;
  }

  if (!API_KEY) {
    throw new Error("FOOTBALL_API_KEY 未配置");
  }

  const url = new URL(path, API_URL);
  if (searchParams) {
    Object.entries(searchParams).forEach(([k, v]) => {
      url.searchParams.set(k, String(v));
    });
  }

  const res = await fetch(url.toString(), {
    headers: { "x-apisports-key": API_KEY },
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    throw new Error(`Football API 请求失败: ${res.status}`);
  }

  const json = await res.json();

  console.log('[fetchWithCache] data.errors:', JSON.stringify(json?.errors));
  console.log('[fetchWithCache] is array:', Array.isArray(json?.errors));
  console.log('[fetchWithCache] results:', json?.results);

  // 检测额度耗尽（errors:[] 空数组表示无错误，不触发切换）
  if (json?.errors && !Array.isArray(json.errors) && json.errors?.requests) {
    console.log('[primary] API quota exhausted:', json.errors.requests);
    primaryExhausted = true;
    throw new Error("PRIMARY_EXHAUSTED");
  }

  cache.set(key, { data: json, timestamp: now });
  return json as T;
}

export async function getTodayMatches() {
  if (primaryExhausted) {
    console.log('[getTodayMatches] primary exhausted, using fallback');
    return fetchFromFallback("today");
  }
  const today = new Date().toISOString().slice(0, 10);
  try {
    return await fetchWithCache<any>(
      `today:${today}`,
      "/fixtures",
      { date: today, timezone: "Asia/Shanghai" }
    );
  } catch (e: any) {
    if (e?.message === "PRIMARY_EXHAUSTED") {
      console.log('[getTodayMatches] switching to fallback');
      return fetchFromFallback("today");
    }
    throw e;
  }
}

export async function getLiveMatches() {
  if (primaryExhausted) {
    console.log('[getLiveMatches] primary exhausted, using fallback');
    return fetchFromFallback("live");
  }
  try {
    const data = await fetchWithCache<any>(
      "live:all",
      "/fixtures",
      { live: "all", timezone: "Asia/Shanghai" }
    );
    console.log('[getLiveMatches] response count:', data?.response?.length);
    console.log('[getLiveMatches] primaryExhausted:', primaryExhausted);
    return data;
  } catch (e: any) {
    if (e?.message === "PRIMARY_EXHAUSTED") {
      console.log('[getLiveMatches] switching to fallback');
      return fetchFromFallback("live");
    }
    throw e;
  }
}

export async function getMatchStatistics(fixtureId: number) {
  return fetchWithCache<any>(
    `stats:${fixtureId}`,
    "/fixtures/statistics",
    { fixture: fixtureId }
  );
}

export async function getMatchOdds(fixtureId: number) {
  return fetchWithCache<any>(
    `odds:${fixtureId}`,
    "/odds",
    { fixture: fixtureId }
  );
}

export async function getHeadToHead(team1Id: number, team2Id: number) {
  return fetchWithCache<any>(
    `h2h:${team1Id}:${team2Id}`,
    "/fixtures/headtohead",
    { h2h: `${team1Id}-${team2Id}` }
  );
}

export async function getTeamRecentForm(teamId: number) {
  return fetchWithCache<any>(
    `form:${teamId}`,
    "/fixtures",
    { team: teamId, last: 5 }
  );
}

export async function getUpcomingMatches(days = 3) {
  // api-football 免费版 from/to 必须带 league+season，改为逐日用 date 参数查询
  const dates: string[] = [];
  for (let i = 1; i <= days; i++) {
    dates.push(new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  }

  if (primaryExhausted) {
    return fetchFromFallback("today"); // today path 已覆盖 today→+7 天
  }

  const results = await Promise.allSettled(
    dates.map((date) =>
      fetchWithCache<any>(`day:${date}`, "/fixtures", { date, timezone: "Asia/Shanghai" }, UPCOMING_CACHE_TTL_MS)
    )
  );

  // 若任一天触发额度耗尽，整体切换 fallback
  const exhausted = results.some(
    (r) => r.status === "rejected" && (r as PromiseRejectedResult).reason?.message === "PRIMARY_EXHAUSTED"
  );
  if (exhausted) {
    return fetchFromFallback("today");
  }

  const allFixtures = results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
    .flatMap((r) => r.value?.response ?? []);

  console.log(`[getUpcomingMatches] ${days} days fetched: ${allFixtures.length} fixtures`);
  return { response: allFixtures };
}

