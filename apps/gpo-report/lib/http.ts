import "server-only";

import { clientIp, createRateLimiter } from "@pod/rag/rate-limit";
import { z } from "zod";
import { RAG_CONFIG } from "./config";

/** Request validation and the abuse guard shared by the API routes. */

export const askBodySchema = z.object({
  question: z.string().trim().min(3, "Ask a slightly longer question.").max(500, "Keep the question under 500 characters."),
  topK: z.number().int().min(1).max(RAG_CONFIG.retrieval.maxTopK).optional(),
  mode: z.enum(["vector", "hybrid"]).optional(),
});

export function jsonError(message: string, status: number, headers?: HeadersInit) {
  return Response.json({ error: message }, { status, headers });
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<{ data: T } | { error: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: jsonError("The request body must be JSON.", 400) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { error: jsonError(parsed.error.issues[0]?.message ?? "Invalid request.", 400) };
  }
  return { data: parsed.data };
}

// No accounts, so this is what stops one visitor burning the Gemini quota.
const askLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });
const retrieveLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

export function rateLimit(request: Request, kind: "ask" | "retrieve"): Response | null {
  const { ok, retryAfterMs } = (kind === "ask" ? askLimiter : retrieveLimiter)(clientIp(request));
  if (ok) return null;
  return jsonError("Too many questions in a short time. Wait a moment and try again.", 429, {
    "retry-after": String(Math.ceil(retryAfterMs / 1000)),
  });
}
