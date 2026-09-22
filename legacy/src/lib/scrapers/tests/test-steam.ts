import { steamScraper } from "../sources/steam"

async function test() {

  console.log("Searching Steam...\n")

  const results = await steamScraper.search("hollow knight")

  console.log("Search results:")
  console.log(results)

  if (results.length === 0) {
    console.log("Nenhum resultado encontrado")
    return
  }

  const first = results[0]

  console.log("\nScraping:", first.url)

  const metadata = await steamScraper.scrape(first.url)

  console.log("\nMetadata:")
  console.log(metadata)
}

test()