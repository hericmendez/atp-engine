export interface EnrichmentJobDto {
  id: string;
  type: string;
  mode: string;
  status: string;
  progress: { processed: number; total: number | null; percentage: number | null; itemsPerSecond: number | null; etaSeconds: number | null };
  counters: { succeeded: number; found: number; persisted: number; unchanged: number; failed: number };
  cursor: string;
  owner: { id: string | null; leaseExpiresAt: string | null; leaseRemainingMs: number | null; lastHeartbeatAt: string | null };
  timing: { startedAt: string | null; pausedAt: string | null; completedAt: string | null; lastActivityAt: string; updatedAt: string; createdAt: string };
  error: string | null;
  message: string;
}

export interface GameDto {
  id: string;
  titles: { value: string; type: string }[];
  releases: { id: string; platform: { name: string; family: string | null; type: string }; region: { name: string } | null; releaseDate: { year: number; month: number | null; day: number | null; precision: string } | null; version: string | null; edition: string | null; distributionChannels: { name: string }[]; launchers: { name: string }[] }[];
  developers: { name: string }[];
  publishers: { name: string }[];
  genres: { name: string }[];
  externalIdentifiers: { source: string; id: string }[];
  relationships: { sourceGameId: string; targetGameId: string; type: string }[];
  evidence: { source: string; externalId: string; retrievedAt: string; rawTitle: string | null }[];
  classification: string;
  completeness: string;
  description: string | null;
  cover: { url: string; source: string; sourceId: string | null; width: number | null; height: number | null; type: string } | null;
  gameType: string | null;
  gameStatus: string | null;
  lastEnrichedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PlatformThumbDto {
  logo: string | null;
  image: string | null;
}

export interface PlatformDto {
  id: string;
  name: string;
  company: string;
  releaseYear: number | null;
  status: string;
  family: string | null;
  type: string | null;
  thumb: PlatformThumbDto | null;
  gameCount: number;
}

export interface PlatformStatsDto {
  total: number;
  notEmpty: number;
  empty: number;
  byStatus: {
    active: number;
    inactive: number;
    discontinued: number;
  };
}
