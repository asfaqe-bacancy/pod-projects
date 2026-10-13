import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, GENERATION_MODEL } from "@pod/ai";

/**
 * Every tunable, and the presets B0–B6 — the ablation ladder. Each preset
 * adds one capability to the one before, so the eval can attribute every
 * gain (or loss) to a single technique (03 §Presets).
 */
export const DOCUMENT = {
  title: "World Bank Economic Report",
  filename: "world-bank-report.pdf",
  path: "data/world-bank-report.pdf",
  cacheDir: "data/cache",
};

export const SCHEMA = "worldbank";

export const RUN_KINDS = ["flat:text", "flat:markdown", "hierarchical"] as const;
export type RunKind = (typeof RUN_KINDS)[number];

export type SearchMode = "vector" | "keyword" | "hybrid";

export interface Preset {
  label: string;
  run: RunKind;
  search: SearchMode;
  analyze: boolean;
  rerank: boolean;
  context: "raw" | "smallToBig";
  summaries: boolean;
  k: number;
}

export const PRESETS = {
  B0: { label: "Baseline", run: "flat:text", search: "vector", analyze: false, rerank: false, context: "raw", summaries: false, k: 6 },
  B1: { label: "+ structured parse", run: "flat:markdown", search: "vector", analyze: false, rerank: false, context: "raw", summaries: false, k: 6 },
  B2: { label: "+ hierarchical", run: "hierarchical", search: "vector", analyze: false, rerank: false, context: "smallToBig", summaries: false, k: 8 },
  B3: { label: "+ hybrid", run: "hierarchical", search: "hybrid", analyze: false, rerank: false, context: "smallToBig", summaries: false, k: 8 },
  B4: { label: "+ query analysis", run: "hierarchical", search: "hybrid", analyze: true, rerank: false, context: "smallToBig", summaries: false, k: 8 },
  B5: { label: "+ rerank", run: "hierarchical", search: "hybrid", analyze: true, rerank: true, context: "smallToBig", summaries: false, k: 8 },
  B6: { label: "+ summaries", run: "hierarchical", search: "hybrid", analyze: true, rerank: true, context: "smallToBig", summaries: true, k: 8 },
} as const satisfies Record<string, Preset>;

export type PresetId = keyof typeof PRESETS;
export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];
/** Updated to the eval winner in Phase 9. */
export const DEFAULT_PRESET: PresetId = "B5";

export const CONFIG = {
  parse: {
    model: GENERATION_MODEL,
    pagesPerBatch: 5,
    concurrency: 3,
    /** Fidelity thresholds (04 §4). */
    minNumericPrecision: 0.98,
    minCoverage: 0.9,
  },
  chunk: {
    flat: { targetChars: 3200, overlapChars: 400 },
    child: { targetChars: 1600, maxChars: 2400 },
    tableMaxChars: 6000,
    /** Sections with these titles stay in the tree but are not retrieved. */
    excludeTitles: /^(table of )?contents$|^abbreviations|^acronyms|^references$|^bibliography$/i,
  },
  embedding: { model: EMBEDDING_MODEL, dims: EMBEDDING_DIMENSIONS, batchSize: 50 },
  retrieval: {
    candidatePool: 30,
    rrfK: 60,
    minFilteredResults: 5,
    maxSubQueries: 3,
    summaryRouteTopSections: 4,
    parentMaxTokens: 2000,
    contextTokenBudget: 12000,
    rerankMinScore: 3,
    rerankPreviewChars: 600,
  },
  generation: { model: GENERATION_MODEL, temperature: 0.2, maxOutputTokens: 1536 },
};
