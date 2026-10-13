import postgres from "postgres";

/**
 * Postgres access for the POD RAG apps.
 *
 * Each app connects with its **own login role** (`gpo_app`, `worldbank_app`,
 * `imac_app`) whose only rights are on its own schema plus `extensions`
 * (pgvector). So even inside one Supabase project, Postgres itself stops one
 * app from reading or writing another app's rows — isolation doesn't depend
 * on our code being bug-free.
 *
 * The connection string comes from the caller, never from the environment
 * here, so a shared package can't pick the wrong database.
 */

export type Sql = postgres.Sql;

const clients = new Map<string, Sql>();

export function createDb(url: string, { max = 3 }: { max?: number } = {}): Sql {
  // One pool per URL per process. In `next dev`, modules re-evaluate on every
  // edit; caching on globalThis stops each edit leaking a connection pool.
  const cache = ((globalThis as { __podDb?: Map<string, Sql> }).__podDb ??= clients);
  const existing = cache.get(url);
  if (existing) return existing;

  const sql = postgres(url, {
    // Supabase's transaction pooler (port 6543) can't hold prepared
    // statements across transactions.
    prepare: false,
    max,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
  });
  cache.set(url, sql);
  return sql;
}

/** pgvector's text form: "[0.1,0.2,…]". Cast with `::extensions.vector`. */
export function toVector(values: number[]): string {
  return `[${values.join(",")}]`;
}

export function fromVector(text: string): number[] {
  return text.replace(/^\[|\]$/g, "").split(",").map(Number);
}

/**
 * Lists tables outside the app's own schema that the current role can read.
 * `check:setup` fails if this isn't empty — the isolation promise, tested.
 */
export async function foreignReadableTables(sql: Sql, ownSchema: string): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`
    select table_schema || '.' || table_name as name
    from information_schema.tables
    where table_schema not in (${ownSchema}, 'extensions', 'pg_catalog', 'information_schema')
      and table_schema not like 'pg_%'
      and has_table_privilege(current_user, quote_ident(table_schema) || '.' || quote_ident(table_name), 'select')
    order by 1
  `;
  return rows.map((row) => row.name);
}
