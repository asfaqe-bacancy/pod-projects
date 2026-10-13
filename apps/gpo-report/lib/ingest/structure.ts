import type { OutlineEntry } from "@pod/rag/pdf";
import type { Paragraph } from "../types";

/**
 * Gives every paragraph a section path, e.g. ["Financial Highlights", "Revenue"].
 *
 * Section paths drive three things: chunk boundaries (a chunk never mixes two
 * sections), the contextual header that is embedded with each chunk, and the
 * section shown next to every source.
 *
 * 1. If the PDF has an outline (bookmarks), it is authoritative: an entry
 *    takes effect on its start page — at the line that matches its title if
 *    one is found, otherwise from the top of the page.
 * 2. Otherwise, headings are guessed: a short line with no closing period, in
 *    Title Case or ALL CAPS, followed by a longer line.
 */

interface PageInput {
  pageNumber: number;
  text: string;
}

interface Boundary {
  path: string[];
  pageNumber: number;
  /** Normalised title to look for on the start page. */
  match: string;
}

export function normaliseTitle(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Outline → ordered list of (path, start page). Entries without a page are skipped. */
export function outlineBoundaries(outline: OutlineEntry[]): Boundary[] {
  const boundaries: Boundary[] = [];

  function walk(entries: OutlineEntry[], parents: string[]) {
    for (const entry of entries) {
      const path = [...parents, entry.title];
      if (entry.pageNumber !== null && entry.title) {
        boundaries.push({ path, pageNumber: entry.pageNumber, match: normaliseTitle(entry.title) });
      }
      walk(entry.children, path);
    }
  }

  walk(outline, []);
  // Stable sort by page keeps outline order within a page.
  return boundaries
    .map((boundary, order) => ({ boundary, order }))
    .sort((a, b) => a.boundary.pageNumber - b.boundary.pageNumber || a.order - b.order)
    .map(({ boundary }) => boundary);
}

const TERMINAL = /[.!?;:,]$/;

/** Heuristic heading test for documents without an outline. */
export function looksLikeHeading(line: string, next: string | undefined): boolean {
  const text = line.trim();
  if (text.length < 3 || text.length > 80) return false;
  if (TERMINAL.test(text)) return false;
  if (/^\d[\d\s.,%$()-]*$/.test(text)) return false; // a number row, not a heading
  if (!/\p{L}/u.test(text)) return false;

  const words = text.split(/\s+/).filter((word) => /\p{L}/u.test(word));
  if (words.length === 0 || words.length > 12) return false;

  const allCaps = text === text.toUpperCase() && /\p{Lu}/u.test(text);
  const minor = /^(a|an|the|and|or|of|in|on|for|to|at|by|with|from|vs\.?)$/i;
  const titleCase = words.every((word, i) => /^[\p{Lu}\d]/u.test(word) || (i > 0 && minor.test(word)));

  if (!allCaps && !titleCase) return false;
  // A heading introduces something longer; two short title lines in a row are
  // more likely a table header or a name list.
  return next === undefined || next.trim().length > text.length;
}

/**
 * Splits a cleaned page into paragraphs. Blank lines always separate
 * paragraphs; a heading line is always its own paragraph.
 */
function pageParagraphs(text: string): { text: string; heading: boolean }[] {
  const lines = text.split("\n");
  const result: { text: string; heading: boolean }[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length) result.push({ text: buffer.join("\n"), heading: false });
    buffer = [];
  };

  lines.forEach((line, index) => {
    if (!line.trim()) {
      flush();
      return;
    }
    const next = lines.slice(index + 1).find((candidate) => candidate.trim());
    if (looksLikeHeading(line, next)) {
      flush();
      result.push({ text: line.trim(), heading: true });
      return;
    }
    buffer.push(line);
  });
  flush();
  return result;
}

export function assignSections(pages: PageInput[], outline: OutlineEntry[]): {
  paragraphs: Paragraph[];
  source: "outline" | "heuristic";
  sections: string[];
} {
  const boundaries = outlineBoundaries(outline);
  const source = boundaries.length > 0 ? "outline" : "heuristic";
  const paragraphs: Paragraph[] = [];
  let current: string[] = [];
  let nextBoundary = 0;

  for (const page of pages) {
    // Outline entries starting on this page.
    const starting: Boundary[] = [];
    while (nextBoundary < boundaries.length && boundaries[nextBoundary].pageNumber <= page.pageNumber) {
      starting.push(boundaries[nextBoundary]);
      nextBoundary += 1;
    }

    const blocks = pageParagraphs(page.text);

    // Entries whose title can't be found on the page apply from its top.
    const pending = [...starting];
    if (source === "outline" && pending.length) {
      const found = (boundary: Boundary) =>
        blocks.some((block) => normaliseTitle(block.text).startsWith(boundary.match));
      while (pending.length && !found(pending[0])) {
        current = pending.shift()!.path;
      }
    }

    for (const block of blocks) {
      if (source === "outline") {
        const key = normaliseTitle(block.text);
        const hit = pending.findIndex((boundary) => key.startsWith(boundary.match));
        if (hit !== -1) {
          // Earlier entries on the page that we skipped past are superseded.
          current = pending[hit].path;
          const exact = key === pending[hit].match;
          pending.splice(0, hit + 1);
          // The heading line itself is a boundary, not content.
          if (exact || block.heading) continue;
        }
        paragraphs.push({ text: block.text, pageNumber: page.pageNumber, sectionPath: current });
        continue;
      }

      if (block.heading) {
        current = [block.text];
        continue;
      }
      paragraphs.push({ text: block.text, pageNumber: page.pageNumber, sectionPath: current });
    }

    if (pending.length) current = pending.at(-1)!.path;
  }

  const sections = [...new Set(paragraphs.map((p) => p.sectionPath.join(" › ")).filter(Boolean))];
  return { paragraphs, source, sections };
}
