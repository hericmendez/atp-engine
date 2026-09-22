import { searchMobyGames } from "../sources/mobygames/search"
import { scrapeMobyGames } from "../sources/mobygames/scraper"

async function run() {

  console.log("\n🔎 Testing MobyGames search...\n")

  const results = await searchMobyGames("doom")

  console.log("Search results:")
  console.dir(results, { depth: null })

  if (results.length === 0) {
    console.log("No results returned.")
    return
  }

  const first = results[0]

  console.log("\n🧪 Testing scrape on first result...\n")
  console.log(first.url)

  const metadata = await scrapeMobyGames(first.url)

  console.log("\nScraped metadata:")
  console.dir(metadata, { depth: null })
}

run()