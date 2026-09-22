// lib/cover-search/types.ts
export type CoverSearchInput = {
  query: string;
  platform?: string;
  year?: number;
};

export type CoverResult = {
  id: string;
  title: string;
  url: string;
  source: string;
  confidence: number;
};
