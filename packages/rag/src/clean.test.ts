import { describe, expect, it } from "vitest";
import {
  cleanPages,
  collapseWhitespace,
  dehyphenate,
  joinWrappedLines,
  normaliseUnicode,
  removePageNumberLines,
  removeRepeatedEdgeLines,
} from "./clean";

describe("normaliseUnicode", () => {
  it("folds ligatures and drops zero-width characters", () => {
    expect(normaliseUnicode("ﬁscal​ofﬁce")).toBe("fiscaloffice");
  });
});

describe("removeRepeatedEdgeLines", () => {
  it("removes a running header that appears on most pages, ignoring page numbers", () => {
    const bodies = ["Printing grew.", "Revenue rose.", "Staff trained.", "Costs fell.", "Passports issued.", "Plans ahead."];
    const pages = bodies.map((body, i) => `GPO Annual Report 2023 | ${i + 1}\n${body}`);
    const { pages: cleaned, removed } = removeRepeatedEdgeLines(pages);
    expect(removed).toBe(6);
    expect(cleaned[0]).toBe("Printing grew.");
  });

  it("keeps lines that only repeat on a few pages", () => {
    const words = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel"];
    const pages = words.map((word, i) => `${i < 2 ? "Revenue" : word} heading\n${word} body text`);
    expect(removeRepeatedEdgeLines(pages).removed).toBe(0);
  });

  it("leaves short documents alone", () => {
    expect(removeRepeatedEdgeLines(["a\nb", "a\nc"]).removed).toBe(0);
  });
});

describe("removePageNumberLines", () => {
  it("drops a bare page number at the bottom but keeps numbers mid-page", () => {
    const page = "Title\nRevenue\n2023\n45\nClosing line\n14";
    const { text, removed } = removePageNumberLines(page);
    expect(removed).toBe(1);
    expect(text).toContain("2023\n45");
    expect(text.endsWith("Closing line")).toBe(true);
  });

  it("drops roman numerals and 'Page 3 of 9'", () => {
    expect(removePageNumberLines("iv\nText here").text).toBe("Text here");
    expect(removePageNumberLines("Text here\nPage 3 of 9").text).toBe("Text here");
  });
});

describe("dehyphenate + joinWrappedLines", () => {
  it("rejoins words split across lines", () => {
    expect(dehyphenate("govern-\nment")).toBe("government");
    expect(dehyphenate("Self-\nService")).toBe("Self-\nService");
  });

  it("joins hard-wrapped sentences but keeps headings on their own line", () => {
    expect(joinWrappedLines("The agency\nprinted more")).toBe("The agency printed more");
    expect(joinWrappedLines("Financial Highlights\nRevenue rose.")).toBe(
      "Financial Highlights\nRevenue rose.",
    );
  });
});

describe("collapseWhitespace", () => {
  it("trims lines and limits blank runs to one", () => {
    expect(collapseWhitespace("  a   b \n\n\n\n c ")).toBe("a b\n\nc");
  });
});

describe("cleanPages", () => {
  it("reports empty pages", () => {
    const { stats } = cleanPages(["Text", "   ", "More"]);
    expect(stats.emptyPages).toBe(1);
  });
});
