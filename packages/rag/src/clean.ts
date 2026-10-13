/**
 * Tidies text extracted from a PDF without changing its meaning.
 *
 * PDF extraction leaves ligatures, running headers and footers, page numbers,
 * hyphenated line breaks and hard-wrapped sentences — all of which make chunks
 * retrieve badly. Each step is a small pure function so it can be tested and
 * reasoned about on its own. Order matters: headers are detected on the raw
 * lines, before lines are joined.
 */

export interface CleanStats {
  repeatedLinesRemoved: number;
  pageNumberLinesRemoved: number;
  emptyPages: number;
}

/** NFKC folds ligatures (ﬁ → fi) and odd spaces; zero-width characters go. */
export function normaliseUnicode(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[​-‍﻿­]/g, "")
    .replace(/\r\n?/g, "\n");
}

const EDGE_LINES = 3;

/** The comparable form of a line: digits dropped, so "Page 12" ≡ "Page 13". */
function lineKey(line: string): string {
  return line
    .toLowerCase()
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

function edgeIndexes(lines: string[]): number[] {
  const nonEmpty = lines
    .map((line, index) => (line.trim() ? index : -1))
    .filter((index) => index >= 0);
  const head = nonEmpty.slice(0, EDGE_LINES);
  const tail = nonEmpty.slice(-EDGE_LINES);
  return [...new Set([...head, ...tail])];
}

/**
 * A line that shows up near the top or bottom of at least `threshold` of the
 * pages is a running header or footer ("GPO Annual Report 2023 | 14"). Only
 * those edge positions are checked, so a phrase that legitimately repeats in
 * body text is never removed.
 */
export function removeRepeatedEdgeLines(
  pages: string[],
  threshold = 0.3,
): { pages: string[]; removed: number } {
  if (pages.length < 4) return { pages, removed: 0 };

  const split = pages.map((page) => page.split("\n"));
  const counts = new Map<string, number>();

  for (const lines of split) {
    const seen = new Set<string>();
    for (const index of edgeIndexes(lines)) {
      const key = lineKey(lines[index]);
      if (key.length < 3 || seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const minimum = Math.max(3, Math.ceil(pages.length * threshold));
  const repeated = new Set(
    [...counts].filter(([, count]) => count >= minimum).map(([key]) => key),
  );

  let removed = 0;
  const cleaned = split.map((lines) => {
    const drop = new Set(
      edgeIndexes(lines).filter((index) => repeated.has(lineKey(lines[index]))),
    );
    removed += drop.size;
    return lines.filter((_, index) => !drop.has(index)).join("\n");
  });

  return { pages: cleaned, removed };
}

const PAGE_NUMBER_LINE = /^\s*(?:page\s+)?(?:\d{1,4}|[ivxlcdm]{1,7})(?:\s+of\s+\d{1,4})?\s*$/i;

/**
 * Drops lines that are only a page number. Only the first and last two lines
 * of a page are checked: a bare number in the middle of a page is usually a
 * table cell and must stay.
 */
export function removePageNumberLines(page: string): { text: string; removed: number } {
  const lines = page.split("\n");
  const nonEmpty = lines
    .map((line, index) => (line.trim() ? index : -1))
    .filter((index) => index >= 0);
  const edges = new Set([...nonEmpty.slice(0, 2), ...nonEmpty.slice(-2)]);
  const drop = new Set([...edges].filter((index) => PAGE_NUMBER_LINE.test(lines[index])));
  return {
    text: lines.filter((_, index) => !drop.has(index)).join("\n"),
    removed: drop.size,
  };
}

/** "govern-\nment" → "government", only when the continuation is lowercase. */
export function dehyphenate(text: string): string {
  return text.replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2");
}

/**
 * A single newline inside a sentence is a hard wrap, not a paragraph. Joined
 * only when the line doesn't end a sentence and the next starts lowercase —
 * conservative on purpose, so headings and list items keep their own lines.
 */
export function joinWrappedLines(text: string): string {
  return text.replace(/([^\n.!?:;])\n(?=[\p{Ll}(])/gu, "$1 ");
}

export function collapseWhitespace(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The full cleaning pass over a document's pages, in order. */
export function cleanPages(rawPages: string[]): { pages: string[]; stats: CleanStats } {
  const normalised = rawPages.map(normaliseUnicode);
  const { pages: withoutRepeats, removed: repeatedLinesRemoved } =
    removeRepeatedEdgeLines(normalised);

  let pageNumberLinesRemoved = 0;
  const pages = withoutRepeats.map((page) => {
    const { text, removed } = removePageNumberLines(page);
    pageNumberLinesRemoved += removed;
    return collapseWhitespace(joinWrappedLines(dehyphenate(text)));
  });

  return {
    pages,
    stats: {
      repeatedLinesRemoved,
      pageNumberLinesRemoved,
      emptyPages: pages.filter((page) => page.length === 0).length,
    },
  };
}
