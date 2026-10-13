import { SetupNotice } from "@pod/ui/rag/setup-notice";
import type { AppStatus } from "@/lib/server";

/** What to do next when the app isn't answering yet — exact commands included. */
export function SetupState({ status }: { status: Exclude<AppStatus, { state: "ready" }> }) {
  if (status.state === "not-ingested") {
    return (
      <SetupNotice
        title="Connected — the report hasn't been ingested yet"
        missing={[]}
        steps={[
          { label: "Put the report at data/gpo-annual-report.pdf, then check the parse by hand.", command: "pnpm --filter gpo-report parse" },
          { label: "Embed and store it as the active run.", command: "pnpm --filter gpo-report ingest --activate" },
        ]}
      />
    );
  }

  if (status.state === "db-error") {
    return (
      <SetupNotice
        title="The database isn't answering"
        missing={[]}
        steps={[
          { label: status.message },
          { label: "Apply the migrations as the app's own role.", command: "pnpm --filter gpo-report db:migrate" },
          { label: "Then verify everything end to end.", command: "pnpm --filter gpo-report check:setup" },
        ]}
      />
    );
  }

  return (
    <SetupNotice
      missing={status.missing}
      steps={[
        { label: "Run supabase/bootstrap.sql once in the Supabase SQL editor (creates the gpo schema and gpo_app role)." },
        { label: "Add DATABASE_URL (as gpo_app) and GEMINI_API_KEY to apps/gpo-report/.env.local — and to the Vercel project." },
        { label: "Create the tables.", command: "pnpm --filter gpo-report db:migrate" },
        { label: "Ingest the report.", command: "pnpm --filter gpo-report ingest --activate" },
      ]}
    />
  );
}
