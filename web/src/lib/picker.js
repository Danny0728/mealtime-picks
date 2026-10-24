// The on-device half of the engine: filter the weekly catalog to what this
// household can watch right now, score it with the weights the family's
// feedback has tuned, and choose 3 picks that differ from each other.

export const TIMES = [
  { id: '20', label: '20 min', lo: 12, hi: 25, target: 20 },
  { id: '30', label: '30 min', lo: 20, hi: 36, target: 30 },
  { id: '45', label: '45 min', lo: 30, hi: 52, target: 45 },
  { id: '60', label: '1 hr+', lo: 45, hi: 140, target: 75 },
  // No time limit: length neither helps nor hurts, the content decides.
  { id: 'any', label: 'Any', any: true },
]

export const MOODS = [
  { id: 'funny', label: 'Funny' },
  { id: 'feelgood', label: 'Feel-good' },
  { id: 'docu', label: 'Documentary' },
  { id: 'thriller', label: 'Thriller' },
  { id: 'standup', label: 'Stand-up' },
  { id: 'sports', label: 'Sports' },
  { id: 'anime', label: 'Anime' },
]

// Age rating, in the style of Indian certificates. `max` is the oldest
// certificate age allowed; unrated titles fall back to the family-safe check.
export const WHO = [
  { id: 'all', label: 'Whole gang', ages: 'U · any age', max: 7 },
  { id: '13', label: 'Teens around', ages: '13+', max: 13 },
  { id: '18', label: 'Kids asleep', ages: '18+', max: Infinity },
]
// Older saves used who's watching.
const LEGACY_WHO = { family: 'all', kids: 'all', adults: '18' }
export const whoId = (who) => LEGACY_WHO[who] ?? (WHO.some((w) => w.id === who) ? who : 'all')

// A certificate's minimum age: CBFC (U, U/A 7+, U/A 13+, U/A 16+, A) plus
// the common US ones TMDB sometimes has. Null when there isn't one we know.
export function certAge(cert) {
  const c = String(cert ?? '').toUpperCase().replace(/[\s/]/g, '')
  if (!c) return null
  if (c === 'U' || c === 'G' || c === 'TV-Y' || c === 'TV-G') return 0
  if (c === 'UA7+' || c === 'PG' || c === 'TV-Y7' || c === 'TV-PG') return 7
  if (c === 'UA' || c === 'UA13+' || c === 'PG-13' || c === 'TV-14') return 13
  if (c === 'UA16+') return 16
  if (c === 'A' || c === 'S' || c === '18+' || c === 'R' || c === 'NC-17' || c === 'TV-MA') return 18
  return null
}

export const DEFAULT_WEIGHTS = { q: 0.3, r: 0.25, p: 0.2, g: 0.15, f: 0.1 }

const FACTORS = ['q', 'r', 'p', 'g', 'f']

// The moods asked for; older saved asks carry a single `mood`.
export function moodsOf(ask) {
  if (Array.isArray(ask?.moods)) return ask.moods
  return ask?.mood ? [ask.mood] : []
}

export function timeById(id) {
  return TIMES.find((t) => t.id === id) ?? TIMES[2]
}

// How well an item fills the slot. Series return how many episodes fit.
export function fit(item, slot) {
  if (slot.any) {
    // Series start with one episode; films and videos fit whatever their length.
    if (item.kind === 'tv') return { score: 1, episodes: 1, minutes: item.epMin || null }
    return { score: 1, minutes: item.runtime || null }
  }
  if (item.kind === 'tv') {
    const ep = item.epMin || 30
    const n = Math.max(0, Math.floor((slot.target + 5) / ep))
    if (n < 1 || ep > slot.hi) return { score: 0 }
    const used = Math.min(n * ep, slot.hi)
    return { score: 1 - Math.abs(slot.target - used) / slot.target * 0.6, episodes: Math.min(n, 4), minutes: Math.min(n, 4) * ep }
  }
  const m = item.runtime || 0
  if (!m || m > slot.hi) return { score: 0 }
  if (m < slot.lo) return { score: 0.35, minutes: m, short: true }
  return { score: 1 - Math.abs(slot.target - m) / (slot.hi - slot.lo + 10), minutes: m }
}

function historySets(store) {
  const taken = new Set(store.seen ?? [])
  const liked = []
  const disliked = []
  const recentShown = new Map()
  const now = Date.now()
  for (const h of store.history ?? []) {
    if (h.status === 'picked' || h.feedback) taken.add(h.id)
    if (h.feedback === 'liked') liked.push(h.id)
    if (h.feedback === 'disliked' || h.feedback === 'unfinished') disliked.push(h.id)
    if (h.status === 'shown' && now - h.at < 5 * 864e5) recentShown.set(h.id, (recentShown.get(h.id) ?? 0) + 1)
  }
  for (const s of store.saved ?? []) for (const id of s.ids ?? []) liked.push(id)
  // "How was it?" on titles watched elsewhere: taste only, they never tune the weights.
  for (const [id, r] of Object.entries(store.seenRatings ?? {})) {
    if (r === 'liked') liked.push(id)
    if (r === 'disliked') disliked.push(id)
  }
  // Watchlisted: not tonight, but it sounded good, so a gentler pull than a like.
  const saved = []
  for (const w of store.watchlist ?? []) {
    taken.add(w.id)
    saved.push(w.id)
  }
  return { taken, liked, disliked, saved, recentShown }
}

// Similarity from the weekly neighbour lists: rank 0 ≈ 1, rank 11 ≈ 0.1.
export function simScore(a, b) {
  if (!a || !b) return 0
  const i = (a.sim ?? []).indexOf(b.id)
  const j = (b.sim ?? []).indexOf(a.id)
  const r = Math.min(i < 0 ? 99 : i, j < 0 ? 99 : j)
  return r === 99 ? 0 : 1 - r / 13
}

function genreOverlap(a, b) {
  if (!a.genres?.length || !b.genres?.length) return 0
  const s = new Set(a.genres)
  return b.genres.filter((g) => s.has(g)).length / Math.max(a.genres.length, b.genres.length)
}

// Not in the household's languages: watchable with subtitles, ranked lower.
export function isSubtitled(item, settings) {
  return Boolean(item.lang) && !settings.languages.includes(item.lang)
}

// A subtitled title has to be clearly better to beat one in your language:
// about what a big jump in community love and hidden-gem score is worth.
const SUBTITLE_PENALTY = 0.08

function allowed(item, settings, who) {
  const platforms = new Set(settings.platforms)
  if (!item.providers.some((p) => platforms.has(p))) return false
  if (settings.otherLanguages === false && isSubtitled(item, settings)) return false
  // Setup's "Family-safe only" is a hard limit, whatever rating is chosen.
  if (settings.familySafe && !item.safe) return false
  const max = WHO.find((w) => w.id === whoId(who)).max
  if (max === Infinity) return true
  const age = certAge(item.cert)
  if (age === null) return item.safe // unrated: trust the family-safe check
  // U also respects what viewers said (e.g. "not for kids").
  return age <= max && (max >= 13 || item.safe)
}

/**
 * pick returns up to 3 suggestions.
 * @param {object} catalog  catalog.json
 * @param {object} store    local store (settings, history, seen, saved, weights)
 * @param {{time:string, moods:string[], who:string}} ask  several moods mean any of them
 * @param {() => number} rng injectable randomness for tests
 * @param {object[]} keep  picks already on screen to keep; only the free slots are filled
 */
export function pick(catalog, store, ask, rng = Math.random, keep = null) {
  const slot = timeById(ask.time)
  const w = { ...DEFAULT_WEIGHTS, ...(store.weights ?? {}) }
  const { taken, liked, disliked, saved, recentShown } = historySets(store)
  const byId = new Map(catalog.items.map((it) => [it.id, it]))
  const items = (ids) => ids.map((id) => byId.get(id)).filter(Boolean)
  const taste = { liked: items(liked), disliked: items(disliked), saved: items(saved) }

  const moods = moodsOf(ask)
  const candidates = []
  const shortVideos = []
  for (const item of catalog.items) {
    if (taken.has(item.id) || !allowed(item, store.settings, ask.who)) continue
    // Any of the chosen moods: an item is as relevant as its best match.
    let rel = moods.length ? 0 : 0.5
    let mood = null
    for (const m of moods) {
      const v = item.moods?.[m] ?? 0
      if (v > rel) {
        rel = v
        mood = m
      }
    }
    const f = fit(item, slot)
    if (item.kind === 'youtube' && f.short && rel >= 0.15) shortVideos.push({ item, rel })
    if (f.score <= 0 || f.short) continue
    const c = scoreOne(item, rel, f, w, taste, recentShown)
    // Asking for anime is asking for Japanese with subtitles: no penalty then.
    if (isSubtitled(item, store.settings) && mood !== 'anime') c.score -= SUBTITLE_PENALTY
    candidates.push({ ...c, mood: moods.length > 1 ? mood : null })
  }

  // Two short videos that together fill the slot (the YouTube "double bill").
  for (const combo of combos(shortVideos, slot)) {
    candidates.push(scoreCombo(combo, w, taste, recentShown, slot))
  }

  // Mood is a filter when there is enough to choose from, a preference otherwise.
  let pool = candidates
  let moodMatched = true
  if (moods.length) {
    const strict = candidates.filter((c) => c.factors.r >= 0.2)
    moodMatched = strict.length >= 3
    pool = strict.length >= 6 ? strict : candidates
  }
  pool.sort((a, b) => b.score - a.score)

  let picks = []
  if (keep) {
    picks = [...keep]
  } else {
    const cont = continuePick(store, byId, slot)
    if (cont) picks.push(cont)
  }
  return { picks: diversify(pool, picks, 3, rng), poolSize: pool.length, moodMatched }
}

function personalOf(item, taste) {
  let best = null
  let plus = 0
  let via = 'liked'
  for (const [list, weight, how] of [[taste.liked, 1, 'liked'], [taste.saved, 0.5, 'saved']]) {
    for (const l of list) {
      const s = weight * simScore(item, l)
      if (s > plus) {
        plus = s
        best = l
        via = how
      }
    }
  }
  let minus = 0
  for (const d of taste.disliked) minus = Math.max(minus, simScore(item, d))
  return { value: plus - 0.7 * minus, because: best, via }
}

function scoreOne(item, rel, f, w, taste, recentShown) {
  const personal = personalOf(item, taste)
  const factors = { q: item.q ?? 0, r: rel, p: personal.value, g: item.gem ?? 0, f: f.score }
  let score = FACTORS.reduce((s, k) => s + w[k] * factors[k], 0)
  score -= 0.08 * (recentShown.get(item.id) ?? 0) // don't keep showing the same skipped title
  return {
    key: item.id, kind: item.kind === 'tv' ? 'episodes' : 'single', items: [item],
    minutes: f.minutes, episodes: f.episodes, factors, score,
    reason: reasonFor(item, factors, personal),
  }
}

function combos(shorts, slot) {
  shorts.sort((a, b) => (b.item.q + b.rel) - (a.item.q + a.rel))
  const top = shorts.slice(0, 12)
  const out = []
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const a = top[i].item
      const b = top[j].item
      const total = a.runtime + b.runtime
      if (total >= slot.lo && total <= slot.hi) out.push({ a: top[i], b: top[j], total })
    }
  }
  out.sort((x, y) => (y.a.rel + y.b.rel + y.a.item.q + y.b.item.q) - (x.a.rel + x.b.rel + x.a.item.q + x.b.item.q))
  return out.slice(0, 4)
}

function scoreCombo(c, w, taste, recentShown, slot) {
  const pa = personalOf(c.a.item, taste)
  const pb = personalOf(c.b.item, taste)
  const factors = {
    q: (c.a.item.q + c.b.item.q) / 2,
    r: (c.a.rel + c.b.rel) / 2,
    p: Math.max(pa.value, pb.value),
    g: ((c.a.item.gem ?? 0) + (c.b.item.gem ?? 0)) / 2,
    f: 1 - Math.abs(slot.target - c.total) / slot.target * 0.6,
  }
  let score = FACTORS.reduce((s, k) => s + w[k] * factors[k], 0)
  score -= 0.08 * ((recentShown.get(c.a.item.id) ?? 0) + (recentShown.get(c.b.item.id) ?? 0))
  return {
    key: `combo:${c.a.item.id}+${c.b.item.id}`, kind: 'combo', items: [c.a.item, c.b.item],
    minutes: c.total, factors, score,
    reason: 'Two short ones back to back that fill your time.',
  }
}

// MMR (maximal marginal relevance): each next pick trades a little score for
// being different from what's already chosen. The last slot explores.
function diversify(pool, chosen, n, rng) {
  const out = [...chosen]
  const used = new Set(out.flatMap((p) => p.items.map((i) => i.id)))
  const lambda = 0.7
  while (out.length < n && pool.length) {
    const explore = out.length === n - 1 && rng() < 0.35
    const avail = pool.filter((c) => !c.items.some((i) => used.has(i.id)))
    if (!avail.length) break
    let next
    if (explore && avail.length > 4) {
      // Weighted random from ranks 3–25: a slightly adventurous pick.
      const slice = avail.slice(3, 25)
      const total = slice.reduce((s, c) => s + Math.max(c.score, 0.01), 0)
      let r = rng() * total
      next = slice.find((c) => (r -= Math.max(c.score, 0.01)) <= 0) ?? slice[0]
      next = { ...next, explore: true, reason: next.reason + ' A bit different from your usual.' }
    } else {
      let best = -Infinity
      for (const c of avail.slice(0, 60)) {
        let maxSim = 0
        for (const p of out) {
          for (const a of c.items) {
            for (const b of p.items) {
              const s = Math.max(simScore(a, b), genreOverlap(a, b) * 0.5 + (a.kind === b.kind ? 0.15 : 0))
              maxSim = Math.max(maxSim, s)
            }
          }
          // With several moods asked for, spread the picks across them.
          if (c.mood && c.mood === p.mood) maxSim = Math.max(maxSim, 0.5)
        }
        const mmr = lambda * c.score - (1 - lambda) * maxSim
        if (mmr > best) {
          best = mmr
          next = c
        }
      }
    }
    out.push(next)
    next.items.forEach((i) => used.add(i.id))
  }
  return out
}

// A series the family started and liked comes back as "continue" (it is in
// the watched set, which is exactly why it gets its own path).
function continuePick(store, byId, slot) {
  const last = [...(store.history ?? [])].reverse().find((h) => h.status === 'picked' && h.ep)
  if (!last || last.feedback === 'disliked' || last.feedback === 'unfinished') return null
  if (Date.now() - last.at > 21 * 864e5) return null
  const item = byId.get(last.id)
  if (!item || item.kind !== 'tv') return null
  const f = fit(item, slot)
  if (!f.episodes) return null
  const from = last.ep.to + 1
  return {
    key: `continue:${item.id}`, kind: 'continue', items: [item], minutes: f.minutes,
    episodes: f.episodes, epFrom: from, factors: { q: item.q, r: 0, p: 1, g: item.gem, f: f.score }, score: 1,
    reason: `Pick up where you left off: ${f.episodes > 1 ? `episodes ${from}–${from + f.episodes - 1}` : `episode ${from}`}.`,
  }
}

function reasonFor(item, f, personal) {
  if (personal.because && f.p >= 0.3) return `Close to ${personal.because.name}, which you ${personal.via}.`
  if (item.threads >= 3 && item.gem >= 0.6) return `A hidden gem: recommended in ${item.threads} threads, but not widely seen.`
  if (item.platforms >= 2) return `People keep recommending it on Reddit and YouTube.`
  if (item.threads >= 3) return `Recommended in ${item.threads} separate threads.`
  if (item.kind === 'youtube' && item.channel) return `From ${item.channel}.`
  if (f.r >= 0.5) return 'Matches the mood you picked.'
  return 'Fits the time you have.'
}

// Feedback nudges the weights toward whatever drove a liked pick.
export function updateWeights(weights, factors, feedback) {
  const w = { ...DEFAULT_WEIGHTS, ...(weights ?? {}) }
  if (!factors) return w
  const sign = feedback === 'liked' ? 1 : -1
  const mean = FACTORS.reduce((s, k) => s + (factors[k] ?? 0), 0) / FACTORS.length
  for (const k of FACTORS) {
    w[k] = Math.min(0.6, Math.max(0.03, w[k] + 0.04 * sign * ((factors[k] ?? 0) - mean)))
  }
  const sum = FACTORS.reduce((s, k) => s + w[k], 0)
  for (const k of FACTORS) w[k] = Math.round((w[k] / sum) * 1000) / 1000
  return w
}
