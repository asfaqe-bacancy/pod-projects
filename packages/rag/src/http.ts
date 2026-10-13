import type { z } from "zod";
import { clientIp, createRateLimiter } from "./rate-limit";

/** Request helpers shared by the RAG apps' route handlers. */

export function jsonError(message: string, status: number, headers?: HeadersInit) {
  return Response.json({ error: message }, { status, headers });
}

export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ data: T } | { error: Response }> {
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

/**
 * Two per-IP limits: answering spends generation quota, retrieval only
 * embeddings. No accounts, so this is what stops one visitor burning the key.
 */
export function createRouteLimits({ ask = 20, retrieve = 60 }: { ask?: number; retrieve?: number } = {}) {
  const limiters = {
    ask: createRateLimiter({ limit: ask, windowMs: 60_000 }),
    retrieve: createRateLimiter({ limit: retrieve, windowMs: 60_000 }),
  };
  return function rateLimit(request: Request, kind: "ask" | "retrieve"): Response | null {
    const { ok, retryAfterMs } = limiters[kind](clientIp(request));
    if (ok) return null;
    return jsonError("Too many questions in a short time. Wait a moment and try again.", 429, {
      "retry-after": String(Math.ceil(retryAfterMs / 1000)),
    });
  };
}
