const DEFAULT_THE_STATS_API_URL = "https://api.thestatsapi.com/api";

type QueryValue = string | number | boolean | null | undefined;

export type TheStatsRequestOptions = {
  path: string;
  query?: Record<string, QueryValue>;
  revalidate?: number;
};

function apiKey() {
  return process.env.THESTATS_API_KEY || process.env.THE_STATS_API_KEY || "";
}

function baseUrl() {
  return (process.env.THESTATS_API_URL || DEFAULT_THE_STATS_API_URL).replace(/\/+$/, "");
}

export function theStatsConfigStatus() {
  return {
    configured: Boolean(apiKey()),
    baseUrl: baseUrl(),
  };
}

export function buildTheStatsUrl(path: string, query?: Record<string, QueryValue>) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(`${baseUrl()}/${normalizedPath}`);

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    url.searchParams.set(key, String(value));
  });

  return url;
}

export async function fetchTheStatsJson<T = unknown>({
  path,
  query,
  revalidate = 120,
}: TheStatsRequestOptions): Promise<T> {
  const token = apiKey();
  if (!token) throw new Error("THESTATS_API_KEY 未配置");

  const res = await fetch(buildTheStatsUrl(path, query), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    next: { revalidate },
  });

  const text = await res.text();
  let payload: T;
  try {
    payload = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    payload = { raw: text } as T;
  }

  if (!res.ok) {
    throw new Error(`TheStatsAPI 请求失败: ${res.status}`);
  }

  return payload;
}
