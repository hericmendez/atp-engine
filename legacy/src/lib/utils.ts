import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function buildHLTBSearchUrl(gameName: string) {
  const query = encodeURIComponent(gameName.trim())
  return `https://howlongtobeat.com/?q=${query}`
}


