// Find titles in this week's catalog by name (or an alternative title).
// Titles that start with what you typed come first, then ones that contain
// it; within each, the better-loved first.

const MIN_CHARS = 2
const MAX_RESULTS = 30

export function searchCatalog(items, query) {
  const q = query.trim().toLowerCase()
  if (q.length < MIN_CHARS) return []
  const hits = []
  for (const item of items) {
    const names = [item.name, ...(item.altNames ?? [])].filter(Boolean).map((n) => n.toLowerCase())
    const rank = names.some((n) => n.startsWith(q)) ? 0 : names.some((n) => n.includes(q)) ? 1 : -1
    if (rank >= 0) hits.push({ item, rank })
  }
  hits.sort((a, b) => a.rank - b.rank || (b.item.q ?? 0) - (a.item.q ?? 0))
  return hits.slice(0, MAX_RESULTS).map((h) => h.item)
}
