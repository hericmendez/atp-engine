const REGION_ALIASES: Record<string, string> = {
  // North America
  na: 'North America',
  'north america': 'North America',
  usa: 'North America',
  us: 'North America',
  'united states': 'North America',
  'united states of america': 'North America',
  canada: 'North America',

  // Europe
  eu: 'Europe',
  europe: 'Europe',
  uk: 'Europe',
  'united kingdom': 'Europe',
  gb: 'Europe',

  // Japan
  jp: 'Japan',
  japan: 'Japan',
  ja: 'Japan',

  // Asia (non-Japan)
  asia: 'Asia',
  kr: 'Asia',
  korea: 'Asia',
  'south korea': 'Asia',
  tw: 'Asia',
  taiwan: 'Asia',
  hk: 'Asia',
  'hong kong': 'Asia',
  cn: 'Asia',
  china: 'Asia',
  sg: 'Asia',
  singapore: 'Asia',
  'southeast asia': 'Asia',

  // Latin America
  latam: 'Latin America',
  'latin america': 'Latin America',
  br: 'Latin America',
  brazil: 'Latin America',
  mx: 'Latin America',
  mexico: 'Latin America',
  ar: 'Latin America',
  argentina: 'Latin America',
  cl: 'Latin America',
  chile: 'Latin America',

  // Australia / Oceania
  au: 'Australia',
  australia: 'Australia',
  nz: 'Oceania',
  'new zealand': 'Oceania',
  oceania: 'Oceania',

  // Worldwide
  ww: 'Worldwide',
  worldwide: 'Worldwide',
  global: 'Worldwide',
  all: 'Worldwide',

  // Region-free
  regionfree: 'Region Free',
  'region free': 'Region Free',
  rf: 'Region Free',
} as const;

export function resolveRegionAlias(input: string): string {
  const normalized = input.trim().toLowerCase();
  return REGION_ALIASES[normalized] ?? input.trim();
}
