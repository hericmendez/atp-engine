//src/lib/scrapers/core/registry.ts

import { steamScraper } from "../sources/steam"
import { GameScraper } from "./types"
import { wikipediaScraper } from "@/lib/scrapers/sources/wikipedia"

export const scrapers: GameScraper[] = [
  wikipediaScraper,
  steamScraper
]