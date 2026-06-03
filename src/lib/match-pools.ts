"use client";

export const FAVORITES_KEY = "scoutai_favorites";
export const PREDICTION_POOL_KEY = "scoutai_prediction_pool";
export const MATCH_POOLS_UPDATED_EVENT = "scoutai:match-pools-updated";
export const MATCH_SNAPSHOTS_KEY = "scoutai_match_snapshots";

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
  [key: string]: unknown;
};

export type MatchPoolCleanupResult = {
  favoriteIds: number[];
  predictionPoolIds: number[];
  removedIds: string[];
  removedFavoriteCount: number;
  removedPredictionPoolCount: number;
};

export type StoredMatchSnapshot<T extends MatchPoolCandidate = MatchPoolCandidate> = T & {
  id: number;
  savedAt: string;
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

export function readStoredMatchSnapshots<T extends MatchPoolCandidate = MatchPoolCandidate>() {
  if (!isBrowser()) return {} as Record<string, StoredMatchSnapshot<T>>;

  try {
    const raw = window.localStorage.getItem(MATCH_SNAPSHOTS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, StoredMatchSnapshot<T>>)
      : ({} as Record<string, StoredMatchSnapshot<T>>);
  } catch {
    return {} as Record<string, StoredMatchSnapshot<T>>;
  }
}

export function writeStoredMatchSnapshots<T extends MatchPoolCandidate>(
  matches: T[]
) {
  if (!isBrowser()) return {} as Record<string, StoredMatchSnapshot<T>>;
  const current = readStoredMatchSnapshots<T>();
  const next = { ...current };

  matches.forEach((match) => {
    const id = normalizeId(match.id);
    if (!id) return;
    next[String(id)] = {
      ...match,
      id,
      savedAt: new Date().toISOString(),
    };
  });

  window.localStorage.setItem(MATCH_SNAPSHOTS_KEY, JSON.stringify(next));
  return next;
}

export function removeStoredMatchSnapshotsForIds(ids: Array<string | number>) {
  if (!isBrowser()) return;
  const current = readStoredMatchSnapshots();
  const next = { ...current };
  ids.forEach((value) => {
    const id = normalizeId(value);
    if (id) delete next[String(id)];
  });
  window.localStorage.setItem(MATCH_SNAPSHOTS_KEY, JSON.stringify(next));
}

export function isFinishedOrExpiredMatch(match: MatchPoolCandidate, now = Date.now()) {
  const status = String(match.status ?? "").trim().toLowerCase();
  if (FINISHED_STATUS.has(status)) return true;

  const dateMs = match.date ? new Date(match.date).getTime() : Number.NaN;
  return Number.isFinite(dateMs) && dateMs + STALE_AFTER_KICKOFF_MS < now;
}

export function cleanupStoredMatchPools(
  matches: MatchPoolCandidate[],
  options: { removeMissing?: boolean; removeFinishedFavorites?: boolean } = {}
): MatchPoolCleanupResult {
  const favoriteIds = readFavoriteIds();
  const predictionPoolIds = readPredictionPoolIds();
  const currentIds = new Set(matches.map((match) => String(match.id)));
  const removedFavoriteIds = new Set<string>();
  const removedPredictionPoolIds = new Set<string>();

  matches.forEach((match) => {
    const id = String(match.id);
    if (predictionPoolIds.map(String).includes(id) && isFinishedOrExpiredMatch(match)) {
      removedPredictionPoolIds.add(id);
    }
    if (
      options.removeFinishedFavorites &&
      favoriteIds.map(String).includes(id) &&
      isFinishedOrExpiredMatch(match)
    ) {
      removedFavoriteIds.add(id);
    }
  });

  if (options.removeMissing && matches.length > 0) {
    predictionPoolIds.map(String).forEach((id) => {
      if (!currentIds.has(id)) removedPredictionPoolIds.add(id);
    });
  }

  const removedIds = new Set([...removedFavoriteIds, ...removedPredictionPoolIds]);

  if (removedIds.size === 0) {
    return {
      favoriteIds,
      predictionPoolIds,
      removedIds: [],
      removedFavoriteCount: 0,
      removedPredictionPoolCount: 0,
    };
  }

  const nextFavoriteIds = favoriteIds.filter((id) => !removedFavoriteIds.has(String(id)));
  const nextPredictionPoolIds = predictionPoolIds.filter(
    (id) => !removedPredictionPoolIds.has(String(id))
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
    removedFavoriteCount: removedFavoriteIds.size,
    removedPredictionPoolCount: removedPredictionPoolIds.size,
  };
}
