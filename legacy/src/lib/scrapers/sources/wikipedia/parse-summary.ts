// src/lib/scrapers/wikipedia/parse-summary.ts
import type { CheerioAPI } from "cheerio";

export function parseSummary($: CheerioAPI) {
  const paragraphs = $("#mw-content-text > div.mw-parser-output > p")
    .toArray()
    .map(p => $(p).text().trim())
    .filter(text => text.length > 50);

  return paragraphs[0];
}
