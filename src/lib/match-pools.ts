"use client";

export const FAVORITES_KEY = "scoutai_favorites";
export const PREDICTION_POOL_KEY = "scoutai_prediction_pool";
export const MATCH_POOLS_UPDATED_EVENT = "scoutai:match-pools-updated";

const FINISHED_STATUS = new Set([
  "finished",
  "ft",
  "aet",
  "pen",
  "pst",
  "canc",
  "abd",
  "awd",
  "wo",
  "postponed",
  "cancelled",
  "abandoned",
]);

const STALE_AFTER_KICKOFF_MS = 4 * 60 * 60 * 1000;

export type MatchPoolCandidate = {
  id: string | number;
  status?: string | null;
  date?: string | null;
};

export type MatchPoolCleanupResult = {
  favoriteIds: number[];
  predictionPoolIds: number[];
  removedIds: string[];
  removedFavoriteCount: number;
  removedPredictionPoolCount: number;
};

function isBrowser() {
  return typeof window !== "undefined";
}

function normalizeId(value: unknown) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? Math.round(id) : null;
}

export function normalizeMatchIdList(value: unknown) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<number>();
  return value.reduce<number[]>((list, item) => {
    const id = normalizeId(item);
    if (!id || seen.has(id)) return list;
    seen.add(id);
    list.push(id);
    return list;
  }, []);
}

export function readStoredMatchIds(key: string) {
  if (!isBrowser()) return [];

  try {
    const raw = window.localStorage.getItem(key);
    return normalizeMatchIdList(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

export function writeStoredMatchIds(key: string, ids: Array<string | number>) {
  if (!isBrowser()) return [];
  const normalized = normalizeMatchIdList(ids);
  window.localStorage.setItem(key, JSON.stringify(normalized));
  window.dispatchEvent(new Event(MATCH_POOLS_UPDATED_EVENT));
  return normalized;
}

export function readFavoriteIds() {
  return readStoredMatchIds(FAVORITES_KEY);
}

export function readPredictionPoolIds() {
  return readStoredMatchIds(PREDICTION_POOL_KEY);
}

export function isFinishedOrExpiredMatch(match: MatchPoolCandidate, now = Date.now()) {
  const status = String(match.status ?? "").trim().toLowerCase();
  if (FINISHED_STATUS.has(status)) return true;

  const dateMs = match.date ? new Date(match.date).getTime() : Number.NaN;
  return Number.isFinite(dateMs) && dateMs + STALE_AFTER_KICKOFF_MS < now;
}

export function cleanupStoredMatchPools(
  matches: MatchPoolCandidate[],
  options: { removeMissing?: boolean } = {}
): MatchPoolCleanupResult {
  const favoriteIds = readFavoriteIds();
  const predictionPoolIds = readPredictionPoolIds();
  const storedIds = new Set([...favoriteIds, ...predictionPoolIds].map(String));
  const currentIds = new Set(matches.map((match) => String(match.id)));
  const removedIds = new Set<string>();

  matches.forEach((match) => {
    const id = String(match.id);
    if (storedIds.has(id) && isFinishedOrExpiredMatch(match)) {
      removedIds.add(id);
    }
  });

  if (options.removeMissing && matches.length > 0) {
    storedIds.forEach((id) => {
      if (!currentIds.has(id)) removedIds.add(id);
    });
  }

  if (removedIds.size === 0) {
    return {
      favoriteIds,
      predictionPoolIds,
      removedIds: [],
      removedFavoriteCount: 0,
      removedPredictionPoolCount: 0,
    };
  }

  const nextFavoriteIds = favoriteIds.filter((id) => !removedIds.has(String(id)));
  const nextPredictionPoolIds = predictionPoolIds.filter(
    (id) => !removedIds.has(String(id))
  );

  if (nextFavoriteIds.length !== favoriteIds.length) {
    writeStoredMatchIds(FAVORITES_KEY, nextFavoriteIds);
  }

  if (nextPredictionPoolIds.length !== predictionPoolIds.length) {
    writeStoredMatchIds(PREDICTION_POOL_KEY, nextPredictionPoolIds);
  }

  return {
    favoriteIds: nextFavoriteIds,
    predictionPoolIds: nextPredictionPoolIds,
    removedIds: [...removedIds],
    removedFavoriteCount: favoriteIds.length - nextFavoriteIds.length,
    removedPredictionPoolCount: predictionPoolIds.length - nextPredictionPoolIds.length,
  };
}

