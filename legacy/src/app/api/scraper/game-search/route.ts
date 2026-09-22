// src/app/api/scraper/game-search/routes.ts

import { NextResponse } from "next/server"
import { scrapeWikipediaGameMetadata } from "@/lib/scrapers/sources/wikipedia/scraper"
import { searchGames } from "@/lib/scrapers/core/engine"

export async function GET(req: Request) {

  const { searchParams } = new URL(req.url)

  const title = searchParams.get("title")
  const mode = searchParams.get("mode") ?? "single"
  const page = Number(searchParams.get("page") ?? 1)
  const limit = Number(searchParams.get("limit") ?? 10)
  console.log("mode ==> ", mode);

  if (!title) {
    return NextResponse.json(
      { error: "Missing title" },
      { status: 400 }
    )
  }

  try {


    if (mode === "list") {

      const results = await searchGames(title, page, limit)

      return NextResponse.json(results)
    }

    if (mode === "single") {

      const data = await scrapeWikipediaGameMetadata(title)

      return NextResponse.json(data)
    }

    return NextResponse.json(
      { error: "Invalid mode" },
      { status: 400 }
    )

  } catch (err) {

    console.error(err)

    return NextResponse.json(
      { error: "Scraper failed" },
      { status: 500 }
    )

  }
}