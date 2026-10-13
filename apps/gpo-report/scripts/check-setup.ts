/**
 * `pnpm check:setup` — confirms everything outside the code is in place:
 * env vars, Gemini key and models, the database, this app's isolation, the
 * migrations, the source PDF and the gold set. Exits non-zero on any failure.
 */
import { access } from "node:fs/promises";
import { createGemini, createGeminiEmbedder, Type } from "@pod/ai";
import { createDb, foreignReadableTables } from "@pod/db";
import { DOCUMENT, RAG_CONFIG, SCHEMA } from "../lib/config";
import { readEnv } from "../lib/env";
import { getActiveRun } from "../lib/db/runs";
import { isLabelled, loadGoldSet } from "../lib/eval/questions";

const failures: string[] = [];
const pass = (message: string) => console.log(`  ok    ${message}`);
const warn = (message: string) => console.log(`  warn  ${message}`);
const fail = (message: string, fix?: string) => {
  console.log(`  FAIL  ${message}`);
  if (fix) console.log(`        → ${fix}`);
  failures.push(message);
};

const env = readEnv();

console.log("\nEnvironment");
if (env.databaseUrl) pass("DATABASE_URL"); else fail("DATABASE_URL is not set", "copy .env.example to .env.local");
if (env.geminiApiKey) pass("GEMINI_API_KEY"); else fail("GEMINI_API_KEY is not set", "copy .env.example to .env.local");

if (env.geminiApiKey) {
  console.log("\nGemini");
  const gemini = createGemini({ apiKey: env.geminiApiKey });
  try {
    const reply = await gemini.generateJson<{ reply: string }>({
      prompt: "Reply with exactly: ok",
      schema: { type: Type.OBJECT, properties: { reply: { type: Type.STRING } }, required: ["reply"] },
      maxOutputTokens: 64,
    });
    pass(`${RAG_CONFIG.generation.model} answered (${JSON.stringify(reply)})`);
  } catch (error) {
    fail(`${RAG_CONFIG.generation.model} failed: ${(error as Error).message}`);
  }
  try {
    const embedder = createGeminiEmbedder({ sdk: gemini.sdk });
    const vector = await embedder.embedQuery("annual report revenue");
    pass(`${embedder.model} returned ${vector.length} dims, norm ${Math.hypot(...vector).toFixed(3)}`);
  } catch (error) {
    fail(`embeddings failed: ${(error as Error).message}`);
  }
}

if (env.databaseUrl) {
  console.log("\nDatabase");
  const sql = createDb(env.databaseUrl, { max: 1 });
  try {
    const [who] = await sql<{ user: string; version: string }[]>`select current_user as user, version()`;
    pass(`connected as ${who.user}`);

    const [ext] = await sql<{ ok: boolean }[]>`select exists(select 1 from pg_extension where extname = 'vector') as ok`;
    if (ext.ok) pass("pgvector installed"); else fail("pgvector missing", "run supabase/bootstrap.sql");

    const foreign = await foreignReadableTables(sql, SCHEMA);
    if (foreign.length === 0) pass(`isolated: role can read only "${SCHEMA}" (+ extensions)`);
    else fail(`role can read tables outside "${SCHEMA}": ${foreign.slice(0, 5).join(", ")}${foreign.length > 5 ? "…" : ""}`, "connect as gpo_app, not postgres/service role");

    const tables = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables where table_schema = ${SCHEMA}
    `;
    const names = new Set(tables.map((t) => t.table_name));
    const expected = ["documents", "ingestion_runs", "chunks", "queries"];
    const missing = expected.filter((t) => !names.has(t));
    if (missing.length === 0) pass("tables present");
    else fail(`missing tables: ${missing.join(", ")}`, "pnpm db:migrate");

    if (missing.length === 0) {
      const run = await getActiveRun(sql);
      if (run) pass(`active run ${run.id.slice(0, 8)} · ${run.chunkCount} chunks · ${run.embeddingModel}/${run.embeddingDims}`);
      else warn("no active ingestion run yet — pnpm ingest --activate");
    }
  } catch (error) {
    fail(`database check failed: ${(error as Error).message}`);
  } finally {
    await sql.end();
  }
}

console.log("\nInputs");
try {
  await access(DOCUMENT.path);
  pass(DOCUMENT.path);
} catch {
  fail(`${DOCUMENT.path} not found`, "put the report PDF there");
}
try {
  const gold = await loadGoldSet();
  const provided = gold.questions.filter((q) => q.source === "provided");
  const labelled = gold.questions.filter(isLabelled);
  if (provided.length) pass(`gold set: ${gold.questions.length} questions (${provided.length} provided, ${labelled.length} labelled)`);
  else warn("gold set has no provided sample questions yet — add them to eval/questions.json");
} catch (error) {
  fail(`eval/questions.json invalid: ${(error as Error).message}`);
}

console.log(failures.length ? `\n${failures.length} problem(s).\n` : "\nAll good.\n");
process.exit(failures.length ? 1 : 0);
