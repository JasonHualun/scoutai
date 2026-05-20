export type PortfolioAllocation = {
  usedPoints: number;
  totalPercent: number;
  selectedMatchIds: number[];
  updatedAt: string;
};

const PORTFOLIO_ALLOCATION_KEY = "scoutai:portfolio-allocation";
const PORTFOLIO_ALLOCATION_EVENT = "scoutai:portfolio-allocation-updated";

function isBrowser() {
  return typeof window !== "undefined";
}

function safeNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function readPortfolioAllocation(): PortfolioAllocation {
  if (!isBrowser()) {
    return { usedPoints: 0, totalPercent: 0, selectedMatchIds: [], updatedAt: "" };
  }

  try {
    const raw = window.localStorage.getItem(PORTFOLIO_ALLOCATION_KEY);
    if (!raw) {
      return { usedPoints: 0, totalPercent: 0, selectedMatchIds: [], updatedAt: "" };
    }

    const parsed = JSON.parse(raw) as Partial<PortfolioAllocation>;
    return {
      usedPoints: Math.max(0, Math.round(safeNumber(parsed.usedPoints))),
      totalPercent: Math.max(0, safeNumber(parsed.totalPercent)),
      selectedMatchIds: Array.isArray(parsed.selectedMatchIds)
        ? parsed.selectedMatchIds.filter((id): id is number => typeof id === "number")
        : [],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
    };
  } catch {
    return { usedPoints: 0, totalPercent: 0, selectedMatchIds: [], updatedAt: "" };
  }
}

export function savePortfolioAllocation(allocation: Omit<PortfolioAllocation, "updatedAt">) {
  if (!isBrowser()) return;

  const nextAllocation = {
    ...allocation,
    usedPoints: Math.max(0, Math.round(allocation.usedPoints)),
    totalPercent: Math.max(0, allocation.totalPercent),
    updatedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(
    PORTFOLIO_ALLOCATION_KEY,
    JSON.stringify(nextAllocation)
  );
  window.dispatchEvent(
    new CustomEvent(PORTFOLIO_ALLOCATION_EVENT, { detail: nextAllocation })
  );
}

export function portfolioAllocationEventName() {
  return PORTFOLIO_ALLOCATION_EVENT;
}
