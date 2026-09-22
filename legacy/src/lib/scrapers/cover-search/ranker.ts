// src/lib/cover-search/ranker.ts

export function scoreWikiResult(title: unknown, query: string) {
  if (typeof title !== "string") return 0;

  let score = 0.5;

  const t = title.toLowerCase();
  const q = query.toLowerCase();

  if (t.includes(q)) score += 0.2;
  if (t.includes("video game")) score += 0.1;
  if (t.match(/\(20\d{2}/)) score += 0.1; // remake moderno
  if (t.match(/\(19\d{2}|200[0-9]/)) score += 0.15; // original clássico
  if (t.includes("vr")) score -= 0.2;
  if (t.includes("disambiguation")) score -= 0.4;
  if (t.toLowerCase() === query.toLowerCase()) score += 3;
  if (t.match(/\(20\d{2}/)) score += 1;

  score += Math.max(0, 5 - t.length / 10);
}
