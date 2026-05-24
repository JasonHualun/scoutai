export const PREDICTION_MODEL_VERSION = "scoutai-local-v1";

export type PredictionOrderItemInput = {
  fixtureId: number;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt?: string | null;
  statusAtPrediction: string;
  market: string;
  direction: string;
  recommendation: string;
  confidence: number;
  score: number;
  grade: string;
  riskLabel: string;
  suggestedPercent: number;
  fairOdds: number;
  offeredOdds?: number | null;
  valueEdge?: number | null;
  oddsLabel: string;
  valueLabel: string;
  reason: string;
  dataBasis: string[];
};

export type PredictionOrderInput = {
  cost: number;
  modelVersion: string;
  riskLevel: string;
  summary: string;
  predictionCount: number;
  selectedCount: number;
  totalSuggestedPercent: number;
  preferencesSnapshot: Record<string, unknown>;
  portfolioSnapshot: Record<string, unknown>;
  items: PredictionOrderItemInput[];
};

export type PredictionOrderItem = PredictionOrderItemInput & {
  id: string;
  orderId: string;
  resultStatus: "pending" | "won" | "lost" | "push" | "void";
  finalScore?: string | null;
  settledAt?: string | null;
};

export type PredictionOrder = {
  id: string;
  status: "generated" | "settled" | "cancelled";
  modelVersion: string;
  riskLevel: string;
  cost: number;
  creditsBefore: number;
  creditsAfter: number;
  predictionCount: number;
  selectedCount: number;
  totalSuggestedPercent: number;
  summary: string;
  createdAt: string;
  settledAt?: string | null;
  items: PredictionOrderItem[];
};
