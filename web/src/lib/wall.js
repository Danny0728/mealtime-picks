// Which posters go on the home screen's wall: the family's own favourites
// first, so it becomes their frame, then the week's big titles.

const SMALL = '/w185/'

export function wallPosters(items, store, limit = 24) {
  const byId = new Map(items.map((i) => [i.id, i]))
  const loved = [
    ...(store.history ?? []).filter((h) => h.feedback === 'liked').map((h) => h.id),
    ...Object.entries(store.seenRatings ?? {}).filter(([, r]) => r === 'liked').map(([id]) => id),
    ...(store.saved ?? []).flatMap((s) => s.ids ?? []),
  ]
  const saved = (store.watchlist ?? []).map((w) => w.id)
  const byQ = (a, b) => (b.q ?? 0) - (a.q ?? 0)
  const popular = items.filter((i) => i.popular).sort(byQ).map((i) => i.id)
  const rest = items.filter((i) => !i.popular).sort(byQ).map((i) => i.id)

  const out = []
  const used = new Set()
  for (const id of [...loved, ...saved, ...popular, ...rest]) {
    if (out.length >= limit) break
    const it = byId.get(id)
    if (!it || used.has(id) || it.kind === 'youtube' || !it.poster) continue
    used.add(id)
    out.push(it.poster.replace(/\/w\d+\//, SMALL))
  }
  return out
}

// Deal posters into rows, cycling a short list so no row is left half empty.
export function wallRows(posters, rows = 3, perRow = 8) {
  if (!posters.length) return []
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: perRow }, (_, i) => posters[(r * perRow + i) % posters.length]),
  )
}
