import { COUNTRY_CODES, REGION_CODES } from "./vocab";
import { findCountries, findRegions } from "./extract";
import type { QueryFilters } from "../types";

/**
 * The LLM only *proposes* filters; they are validated here against the
 * vocabularies and the report's real chapter titles. Anything unknown is
 * dropped and reported, so a hallucinated filter can never hide the answer.
 */
export function validateFilters(
  proposed: QueryFilters,
  { chapters, minYear = 1990, maxYear = 2035 }: { chapters: string[]; minYear?: number; maxYear?: number },
): { filters: QueryFilters; dropped: string[] } {
  const dropped: string[] = [];
  const filters: QueryFilters = {};

  const regions = (proposed.regions ?? []).flatMap((value) => {
    const code = value.toUpperCase();
    if (REGION_CODES.includes(code)) return [code];
    const byName = findRegions(value);
    if (byName.length) return byName;
    dropped.push(`region:${value}`);
    return [];
  });
  if (regions.length) filters.regions = [...new Set(regions)];

  const countries = (proposed.countries ?? []).flatMap((value) => {
    const code = value.toUpperCase();
    if (COUNTRY_CODES.includes(code)) return [code];
    const byName = findCountries(value);
    if (byName.length) return byName;
    dropped.push(`country:${value}`);
    return [];
  });
  if (countries.length) filters.countries = [...new Set(countries)];

  const years = (proposed.years ?? []).filter((year) => {
    const ok = Number.isInteger(year) && year >= minYear && year <= maxYear;
    if (!ok) dropped.push(`year:${year}`);
    return ok;
  });
  if (years.length) filters.years = [...new Set(years)];

  const types = (proposed.contentTypes ?? []).filter((type) => {
    const ok = ["table", "figure", "box", "text"].includes(type);
    if (!ok) dropped.push(`type:${type}`);
    return ok;
  });
  if (types.length) filters.contentTypes = types;

  if (proposed.chapter) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const match = chapters.find((title) => norm(title) === norm(proposed.chapter!));
    if (match) filters.chapter = match;
    else dropped.push(`chapter:${proposed.chapter}`);
  }

  return { filters, dropped };
}

/** Order in which filters are relaxed when too few results come back (06 §4). */
export const RELAXATION_ORDER: (keyof QueryFilters)[] = ["contentTypes", "years", "countries", "regions", "chapter"];

export function relaxOnce(filters: QueryFilters): { filters: QueryFilters; relaxed: keyof QueryFilters } | null {
  for (const key of RELAXATION_ORDER) {
    if (filters[key] !== undefined) {
      const next = { ...filters };
      delete next[key];
      return { filters: next, relaxed: key };
    }
  }
  return null;
}

export function hasFilters(filters: QueryFilters): boolean {
  return RELAXATION_ORDER.some((key) => filters[key] !== undefined);
}
