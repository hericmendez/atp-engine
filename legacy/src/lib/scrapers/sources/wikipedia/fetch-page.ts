import * as cheerio from "cheerio";

export async function fetchWikipediaPage(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "SaveStateBot/1.0 (metadata-scraper)"
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Wikipedia page: ${url}`);
  }

  const html = await res.text();
  return cheerio.load(html);
}