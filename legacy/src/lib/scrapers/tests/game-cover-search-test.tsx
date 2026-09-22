//components/game-cover-search-test.tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import clsx from "clsx";
import { searchGameCoversClient } from "@/lib/scrapers/cover-search/client";
import type { CoverResult } from "@/lib/scrapers/cover-search/types";
type GameCoverSearchProps = {
  query: string;
  value?: {
    url: string;
    source: string;
    confidence: number;
  };
  onChange: (cover: {
    url: string;
    source: string;
    confidence: number;
  }) => void;
};

export default function GameCoverSearch({
  query,
  value,
  onChange
}: GameCoverSearchProps) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CoverResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const selectedUrl = value?.url;

  async function handleSearch() {
    if (!query?.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const data = await searchGameCoversClient(query);
      setResults(data);
    } catch {
      setError("Não foi possível buscar capas");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-4 max-w-xl">
      <Button type="button" onClick={handleSearch} disabled={loading}>
        {loading ? "Buscando..." : "Buscar capa"}
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {results.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {results.map((cover) => (
            <button
              key={cover.id}
              type="button"
              onClick={() =>
                onChange({
                  url: cover.url,
                  source: cover.source,
                  confidence: cover.confidence
                })
              }
              className={clsx(
                "rounded-md overflow-hidden border transition",
                selectedUrl === cover.url
                  ? "ring-2 ring-primary border-primary"
                  : "border-muted hover:border-foreground/40"
              )}
            >
              <img
                src={cover.url}
                alt="Capa do jogo"
                className="aspect-[2/3] object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
