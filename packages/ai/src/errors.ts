/** A failure we can explain to the user without leaking internals. */
export class GeminiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "GeminiError";
  }
}

/** Maps an SDK or HTTP failure onto a message a person can act on. */
export function describeGeminiError(cause: unknown): GeminiError {
  if (cause instanceof GeminiError) return cause;
  const raw = cause instanceof Error ? cause.message : String(cause);

  if (/429|RESOURCE_EXHAUSTED|quota/i.test(raw)) {
    return new GeminiError(
      "The model is rate limited right now. Give it a few seconds and try again.",
      true,
      { cause },
    );
  }
  if (/50[0-9]|UNAVAILABLE|overloaded|high demand/i.test(raw)) {
    return new GeminiError(
      "The model is busy. Trying again usually works.",
      true,
      { cause },
    );
  }
  if (/API key|API_KEY_INVALID|PERMISSION_DENIED|401|403/i.test(raw)) {
    return new GeminiError(
      "Gemini rejected the API key. Check GEMINI_API_KEY.",
      false,
      { cause },
    );
  }
  if (/SAFETY|blocked/i.test(raw)) {
    return new GeminiError(
      "The model declined to answer that. Try rewording it.",
      false,
      { cause },
    );
  }
  if (/abort/i.test(raw)) {
    return new GeminiError("The request was cancelled.", false, { cause });
  }
  return new GeminiError(
    "Gemini couldn't complete that request. Try again in a moment.",
    true,
    { cause },
  );
}

/**
 * Retries only what is worth retrying, with exponential backoff.
 * Rate limits and overloads usually clear within a few seconds.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  { attempts = 3, baseDelayMs = 700 }: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  let lastError: GeminiError | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (cause) {
      lastError = describeGeminiError(cause);
      if (!lastError.retryable || attempt === attempts) throw lastError;
      await new Promise((resolve) =>
        setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)),
      );
    }
  }

  throw lastError ?? new GeminiError("Unknown Gemini failure.", false);
}
