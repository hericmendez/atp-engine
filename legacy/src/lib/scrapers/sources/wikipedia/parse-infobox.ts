import type { CheerioAPI } from "cheerio"

function extractList($row: any) {
  return $row
    .find("a")
    .toArray()
    .map((el: any) => el.children[0]?.data?.trim())
    .filter(Boolean)
}

export function parseInfobox($: CheerioAPI) {

  const infobox = $(".infobox")

  if (!infobox.length) return {}

  const getRow = (label: string) =>
    infobox
      .find("tr")
      .filter((_, el) =>
        $(el).find("th").text().toLowerCase().includes(label)
      )
      .first()
      .find("td")

  const developers = extractList(getRow("developer"))
  const publishers = extractList(getRow("publisher"))
  const genres = extractList(getRow("genre"))
  const platforms = extractList(getRow("platform"))

  const releaseText = getRow("release").text()
  const yearMatch = releaseText.match(/\b(19|20)\d{2}\b/)

  return {
    developers,
    publishers,
    genres,
    platforms,
    release_date: yearMatch ? String(Number(yearMatch[0])) : undefined
  }
}