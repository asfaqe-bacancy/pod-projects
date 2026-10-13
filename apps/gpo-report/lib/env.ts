/**
 * Environment in one place. Nothing here throws on import: the app renders a
 * setup notice when something is missing instead of crashing, and scripts
 * call `requireEnv()` to fail early with a clear message.
 *
 * Both values are server-only. There are no NEXT_PUBLIC_ variables — the
 * browser only ever talks to this app's API routes.
 */
export interface AppEnv {
  databaseUrl: string | null;
  geminiApiKey: string | null;
}

function value(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed.includes("<") || trimmed.startsWith("your-")) return null;
  return trimmed;
}

export function readEnv(): AppEnv {
  return {
    databaseUrl: value(process.env.DATABASE_URL),
    geminiApiKey: value(process.env.GEMINI_API_KEY),
  };
}

export function missingEnv(env: AppEnv = readEnv()): string[] {
  const missing: string[] = [];
  if (!env.databaseUrl) missing.push("DATABASE_URL");
  if (!env.geminiApiKey) missing.push("GEMINI_API_KEY");
  return missing;
}

export function requireEnv(...names: (keyof AppEnv)[]): AppEnv {
  const env = readEnv();
  const label: Record<keyof AppEnv, string> = {
    databaseUrl: "DATABASE_URL",
    geminiApiKey: "GEMINI_API_KEY",
  };
  const missing = names.filter((name) => !env[name]).map((name) => label[name]);
  if (missing.length) {
    throw new Error(`${missing.join(" and ")} not set. Copy .env.example to .env.local and fill it in.`);
  }
  return env;
}
