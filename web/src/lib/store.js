// Everything the app remembers lives in localStorage on this one device.
// Its shape is also the backup file the weekly pipeline reads as
// data/feedback.json, so feedback here tunes the search for next week.

const KEY = 'mealtime-picks:v1'
const MAX_HISTORY = 1000

export const ALL_PLATFORMS = [
  { id: 'netflix', label: 'Netflix' },
  { id: 'prime', label: 'Prime Video' },
  { id: 'jiohotstar', label: 'JioHotstar' },
  { id: 'sonyliv', label: 'SonyLIV' },
  { id: 'zee5', label: 'ZEE5' },
  { id: 'crunchyroll', label: 'Crunchyroll' },
  { id: 'youtube', label: 'YouTube' },
]

export const ALL_LANGUAGES = [
  { id: 'hi', label: 'Hindi' },
  { id: 'en', label: 'English' },
  { id: 'mr', label: 'Marathi' },
  { id: 'ta', label: 'Tamil' },
  { id: 'te', label: 'Telugu' },
  { id: 'ml', label: 'Malayalam' },
]

// "How was it?" for something the family watched outside the app.
export const SEEN_RATINGS = [
  { id: 'liked', label: 'Loved it', short: 'Loved' },
  { id: 'ok', label: 'It was OK', short: 'OK' },
  { id: 'disliked', label: "Didn't like it", short: 'Nah' },
]

export function emptyStore() {
  return {
    version: 1,
    settings: { platforms: ['netflix', 'prime', 'youtube'], languages: ['hi', 'en', 'mr'], familySafe: true, onboarded: false, theme: 'system', otherLanguages: true },
    history: [],
    seen: [],
    seenRatings: {}, // id -> 'liked' | 'ok' | 'disliked' for titles watched outside the app
    saved: [],
    watchlist: [], // { id, name, at }: sounds good, not tonight; kept out of the picks
    weights: null,
    lastAsk: { time: '45', moods: ['feelgood'], who: 'family' },
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyStore()
    return normalize(JSON.parse(raw))
  } catch {
    return emptyStore()
  }
}

export function save(store) {
  try {
    const s = { ...store, history: store.history.slice(-MAX_HISTORY) }
    localStorage.setItem(KEY, JSON.stringify(s))
    return true
  } catch {
    return false // private mode or storage full: the app still works this session
  }
}

export function normalize(s) {
  const base = emptyStore()
  return {
    ...base,
    ...s,
    settings: { ...base.settings, ...(s?.settings ?? {}) },
    history: Array.isArray(s?.history) ? s.history : [],
    seen: Array.isArray(s?.seen) ? s.seen : [],
    seenRatings: s?.seenRatings && typeof s.seenRatings === 'object' && !Array.isArray(s.seenRatings) ? s.seenRatings : {},
    saved: Array.isArray(s?.saved) ? s.saved : [],
    watchlist: Array.isArray(s?.watchlist) ? s.watchlist : [],
    lastAsk: normalizeAsk({ ...base.lastAsk, ...(s?.lastAsk ?? {}) }),
  }
}

// Older saves had one `mood`; it's a list now (several moods mean any of them).
function normalizeAsk(a) {
  const { mood, ...rest } = a
  if (Array.isArray(a.moods) && !('mood' in a)) return a
  return { ...rest, moods: mood ? [mood] : [] }
}

export function exportBackup(store) {
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'feedback.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export async function importBackup(file) {
  const text = await file.text()
  return normalize(JSON.parse(text))
}
