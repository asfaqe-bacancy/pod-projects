import { createGemini, createGeminiEmbedder, type Embedder, type Gemini } from "@pod/ai";
import { createDb, type Sql } from "@pod/db";
import { CONFIG } from "./config";
import { readEnv } from "./env";

/**
 * The app's connections, built from this app's own environment only. Shared
 * by API routes (through `lib/server.ts`, which adds `server-only`) and the
 * CLI scripts, so both run exactly the same pipeline code.
 */
export interface Services {
  sql: Sql;
  gemini: Gemini;
  embedder: Embedder;
}

export function createDbFromEnv(): Sql {
  const { databaseUrl } = readEnv();
  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");
  return createDb(databaseUrl);
}

export function createAiFromEnv(): { gemini: Gemini; embedder: Embedder } {
  const { geminiApiKey } = readEnv();
  if (!geminiApiKey) throw new Error("GEMINI_API_KEY is not set.");
  const gemini = createGemini({ apiKey: geminiApiKey, generationModel: CONFIG.generation.model });
  const embedder = createGeminiEmbedder({
    sdk: gemini.sdk,
    model: CONFIG.embedding.model,
    dimensions: CONFIG.embedding.dims,
    batchSize: CONFIG.embedding.batchSize,
  });
  return { gemini, embedder };
}

export function createServicesFromEnv(): Services {
  return { sql: createDbFromEnv(), ...createAiFromEnv() };
}
