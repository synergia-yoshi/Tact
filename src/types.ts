export type SourceItem = {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  publishedAt?: string;
  body?: string;
  author?: string;
  points?: number;
  tags?: string[];
};

export type CandidateItem = SourceItem & {
  rankScore: number;
};

export type AxisScore = {
  score: number;
  reason_japanese: string;
};

export type ScoredItem = CandidateItem & {
  shouldDeliver: boolean;
  titleJapanese: string;
  ttpTotalScore: number;
  axes: {
    imitability: AxisScore;
    timing: AxisScore;
    japan_transferability: AxisScore;
    breakthrough: AxisScore;
    adjacency: AxisScore;
  };
  ttpActionJapanese: string;
  whyItWorksJapanese: string;
  fullTranslationJapanese: string;
  riskNoteJapanese: string;
};

export type RunStats = {
  startedAt: string;
  fetchedCount: number;
  candidateCount: number;
  scoredCount: number;
  deliveredCount: number;
  apiCostUsd: number;
  sourceCounts: Record<string, number>;
  sourceErrors: Record<string, string>;
};

export type SeenState = {
  seenIds: string[];
  dailyCosts: Record<string, number>;
  updatedAt: string | null;
};
