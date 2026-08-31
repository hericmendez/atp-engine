import type { ClassificationCase, IdentityCase, EnrichmentCase } from './harness.js';

// ─── Deterministic Classification Baseline ──────────────────────
// Simple rule: if sourceHints contains the category, use it; else UNKNOWN

export function deterministicClassify(c: ClassificationCase): string {
  const hints = c.sourceHints.map((h) => h.toUpperCase());
  if (hints.includes('DLC')) return 'DLC';
  if (hints.includes('EXPANSION')) return 'EXPANSION';
  if (hints.includes('GAME')) return 'GAME';
  if (hints.includes('MOVIE')) return 'MOVIE';
  if (hints.includes('TV_SHOW')) return 'TV_SHOW';
  if (hints.includes('ANIME')) return 'ANIME';
  if (hints.includes('SOUNDTRACK')) return 'SOUNDTRACK';
  if (hints.includes('BOOK')) return 'BOOK';
  if (hints.includes('HARDWARE')) return 'HARDWARE';
  if (hints.includes('PROMOTIONAL')) return 'PROMOTIONAL';
  if (hints.includes('CHARACTER')) return 'CHARACTER';
  if (hints.includes('FRANCHISE')) return 'FRANCHISE';
  if (hints.includes('PERSON')) return 'PERSON';
  if (hints.includes('EVENT')) return 'EVENT';

  // Try to infer from title/description keywords
  const text = `${c.title} ${c.description}`.toLowerCase();
  if (text.includes('dlc') || text.includes('downloadable content')) return 'DLC';
  if (text.includes('expansion') || text.includes('add-on')) return 'EXPANSION';
  if (text.includes('movie') || text.includes('film')) return 'MOVIE';
  if (text.includes('tv show') || text.includes('television')) return 'TV_SHOW';
  if (text.includes('anime') || text.includes('manga')) return 'ANIME';
  if (text.includes('soundtrack') || text.includes('ost')) return 'SOUNDTRACK';
  if (text.includes('book') || text.includes('novel')) return 'BOOK';
  if (text.includes('console') || text.includes('hardware')) return 'HARDWARE';

  return 'UNKNOWN';
}

// ─── Deterministic Identity Baseline ────────────────────────────
// Simple rule: compare titles after normalization

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function deterministicResolveIdentity(c: IdentityCase): string {
  const candidate = normalizeTitle(c.candidateTitle);
  const existing = normalizeTitle(c.existingTitle);

  // Exact match
  if (candidate === existing) return 'SAME_GAME';

  // One contains the other
  if (candidate.includes(existing) || existing.includes(candidate)) return 'SAME_GAME';

  // Check for common abbreviations
  const abbreviations: Record<string, string> = {
    'gta v': 'grand theft auto v',
    'gta 5': 'grand theft auto v',
    cod: 'call of duty',
    zelda: 'the legend of zelda',
    botw: 'breath of the wild',
    totk: 'tears of the kingdom',
    ff7: 'final fantasy vii',
    ffx: 'final fantasy x',
    ffxiv: 'final fantasy xiv',
    ffxvi: 'final fantasy xvi',
    mh: 'monster hunter',
    mhw: 'monster hunter world',
    rdr2: 'red dead redemption 2',
    gow: 'god of war',
    'h:zd': 'horizon zero dawn',
    ac: "assassin's creed",
    dq: 'dragon quest',
    se: 'skyrim elder',
    ds: 'dark souls',
    bb: 'bloodborne',
    ds3: 'dark souls 3',
    ds2: 'dark souls 2',
    ds1: 'dark souls',
    er: 'elden ring',
    sekiro: 'sekiro shadows die twice',
  };

  const expandedCandidate = abbreviations[candidate] ?? candidate;
  const expandedExisting = abbreviations[existing] ?? existing;

  if (expandedCandidate === expandedExisting) return 'SAME_GAME';
  if (
    expandedCandidate.includes(expandedExisting) ||
    expandedExisting.includes(expandedCandidate)
  ) {
    return 'SAME_GAME';
  }

  // Check if same base title (ignoring version numbers)
  const stripVersion = (s: string) => s.replace(/\s*(part\s*\d+|ii+|iv|v|vi+)\s*/gi, ' ').trim();
  const baseCandidate = stripVersion(candidate);
  const baseExisting = stripVersion(existing);

  if (baseCandidate === baseExisting) return 'SAME_GAME';

  // Different games
  return 'UNRESOLVED';
}

// ─── Deterministic Enrichment Baseline ──────────────────────────
// Simple rule: pick from more authoritative source

const SOURCE_AUTHORITY: Record<string, number> = {
  official_site: 100,
  playstation_store: 90,
  nintendo_store: 90,
  microsoft_store: 90,
  epic_store: 85,
  battle_net: 85,
  ubisoft: 85,
  capcom: 85,
  esrb: 80,
  wikipedia: 70,
  metacritic: 60,
  steam: 50,
  igdb: 40,
};

export function deterministicResolveConflict(c: EnrichmentCase): string {
  const authorityA = SOURCE_AUTHORITY[c.sourceA] ?? 50;
  const authorityB = SOURCE_AUTHORITY[c.sourceB] ?? 50;

  if (authorityA > authorityB) return c.valueA;
  if (authorityB > authorityA) return c.valueB;

  // Same authority: prefer the more specific/complete value
  if (c.valueA.length > c.valueB.length) return c.valueA;
  return c.valueB;
}
