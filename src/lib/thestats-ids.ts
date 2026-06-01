export function numericIdFromTheStats(id?: string | number | null) {
  const numeric = Number(String(id ?? "").replace(/\D/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function candidatesFromNumber(id: number) {
  const raw = String(Math.round(id));
  const padded = raw.padStart(9, "0");
  return Array.from(
    new Set([
      `mt_${raw}`,
      `match_${raw}`,
      `m_${raw}`,
      raw,
      `mt_${padded}`,
      `match_${padded}`,
      `m_${padded}`,
    ])
  );
}

export function isPrefixedTheStatsId(id?: string | number | null) {
  return /^[a-z]+_/i.test(String(id ?? "").trim());
}

export function theStatsMatchIdCandidates(id?: string | number | null) {
  const raw = String(id ?? "").trim();
  if (!raw) return [];
  if (isPrefixedTheStatsId(raw)) return [raw];

  const numeric = numericIdFromTheStats(raw);
  return Array.from(
    new Set([
      Number.isFinite(Number(raw)) && Number(raw) > 0 ? "" : raw,
      ...(numeric > 0 ? candidatesFromNumber(numeric) : []),
    ].filter(Boolean))
  );
}

export function normalizeTheStatsMatchId(id: string | number) {
  const candidates = theStatsMatchIdCandidates(id);
  return candidates[0] ?? String(id);
}
