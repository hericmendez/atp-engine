//src/lib/cover-search/providers/wikipedia-provider.ts

import * as cheerio from "cheerio";
import { CoverResult } from "../types";

function normalizeWikiImage(url: string) {
  if (url.startsWith("//")) return "https:" + url;
  return url;
}

type WikiSearchResponse = {
  query?: {
    search?: {
      pageid: number;
      title: string;
    }[];
  };
};

export async function wikipediaCoverProvider(
  query: string
): Promise<CoverResult[]> {
  // 1. Search via Wikipedia API
  const searchApi =
    "https://en.wikipedia.org/w/api.php" +
    "?action=query" +
    "&list=search" +
    "&srsearch=" +
    encodeURIComponent(`${query} video game`) +
    "&srlimit=8" +
    "&prop=pageimages" +
    "&pithumbsize=500" +
    "&format=json";

  const searchRes = await fetch(searchApi, {
    headers: {
      "User-Agent": "SaveStateBot/1.0 (cover-search)"
    }
  });

  if (!searchRes.ok) return [];

  const searchData = (await searchRes.json()) as WikiSearchResponse;
  const pages = searchData.query?.search ?? [];

  if (!pages.length) return [];

  const results: CoverResult[] = [];
  const queryTokens = query
    .toLowerCase()
    .replace(/[:()]/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 2);
  // 2. Iterate candidate pages
  for (const page of pages) {
    if (results.length >= 3) break;

    const rawTitle = page.title;
    const title = rawTitle.toLowerCase();

    const titleTokens = rawTitle.toLowerCase().replace(/[:()]/g, "");

    const matchedTokens = queryTokens.filter((token) =>
      titleTokens.includes(token)
    );

    // regra-chave 👇
    if (matchedTokens.length === 0) {
      continue;
    }

    // 🔎 Early semantic rejection (cheap and effective)
    if (
      title.includes("soundtrack") ||
      title.includes("album") ||
      title.includes("awards") ||
      title.includes("ceremony") ||
      title.includes("poster") ||
      title.includes("film")
    ) {
      continue;
    }

    const pageUrl = "https://en.wikipedia.org/?curid=" + page.pageid;

    const pageRes = await fetch(pageUrl, {
      headers: {
        "User-Agent": "SaveStateBot/1.0 (cover-search)"
      }
    });

    if (!pageRes.ok) continue;

    const html = await pageRes.text();
    const $ = cheerio.load(html);

    // 🧠 Infobox semantic validation (this smells like a game)
    const infobox = $(".infobox");
    if (!infobox.length) continue;

    const infoboxText = infobox.text().toLowerCase();
    if (
      !infoboxText.includes("developer") &&
      !infoboxText.includes("publisher") &&
      !infoboxText.includes("platform")
    ) {
      continue;
    }

    // 🖼 Extract first infobox image
    const img = infobox.find("img").first();
    if (!img.length) continue;

    const src = img.attr("src");
    if (!src) continue;

    const imageUrl = normalizeWikiImage(src);

    results.push({
      id: `wiki-${page.pageid}`,
      title: rawTitle,
      url: imageUrl,
      source: "wikipedia",
      confidence: 0.75
    });
  }

  return results;
}
