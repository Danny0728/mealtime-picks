// Popular: what the people using the app loved. Each signed-in person keeps
// one public Firestore document, loves/{uid}, listing only title ids they
// loved and ones they rated otherwise (anyone
// can read them; only its owner can write it, enforced by firestore.rules).
// Everyone reads the whole collection with plain requests, so signed-out
// users never download the Firebase SDK; the last list is kept on the device.

import { decodeValue } from './vault.js'

const CACHE_KEY = 'mealtime-picks:popular'
const MAX_IDS = 500 // matches the cap in firestore.rules
const MAX_PAGES = 5
// This person's verdicts: `ids` they loved, `meh` they rated otherwise
// ("Nah", "Didn't finish", "It was OK"). The latest rating of a title wins;
// a rating of something seen outside the app beats an older pick's. Sorted,
// so an unchanged list compares equal.
export function myRatings(store) {
  const verdict = new Map()
  for (const h of store.history ?? []) if (h.feedback) verdict.set(h.id, h.feedback === 'liked')
  for (const [id, r] of Object.entries(store.seenRatings ?? {})) verdict.set(id, r === 'liked')
  const pick = (loved) => [...verdict].filter(([, v]) => v === loved).map(([id]) => id).sort().slice(0, MAX_IDS)
  return { ids: pick(true), meh: pick(false) }
}

const strings = (v) => (Array.isArray(v) ? v.filter((id) => typeof id === 'string') : [])

// One Firestore REST page of loves/* to [{ uid, ids, meh }], one per person.
export function decodeLoves(page) {
  return (page?.documents ?? [])
    .filter((d) => Array.isArray(decodeValue(d.fields?.ids)))
    .map((d) => ({ uid: d.name?.split('/').pop() ?? '', ids: strings(decodeValue(d.fields.ids)), meh: strings(decodeValue(d.fields.meh)) }))
}

// Everyone's lists, with this person's own replaced by what this device has
// now, so their ratings count straight away.
export function withMine(loves, uid, mine) {
  if (!uid) return loves
  return [...loves.filter((e) => e.uid !== uid), { uid, ...mine }]
}

// How sure we can be that people love a title: the Wilson lower bound (95%)
// of the share of its raters who loved it. Few ratings give a cautious
// score, many a confident one, so 3 loves out of 3 beats 1 out of 1, and
// 20 out of 25 beats 3 out of 3.
const Z = 1.96
export function wilson(loved, rated) {
  if (!rated || !loved) return 0
  const p = loved / rated
  const z2 = Z * Z
  return (p + z2 / (2 * rated) - Z * Math.sqrt((p * (1 - p) + z2 / (4 * rated)) / rated)) / (1 + z2 / rated)
}

// `loves`: [{ uid, ids, meh }]. Only titles someone loved (one vote per
// person), ranked by the Wilson score of loves out of ratings; ties go to
// more loves, then the better recommendation (the catalog's quality score).
// Only titles in this week's catalog, since the cards need their details.
export function popularList(loves, items, limit = 30) {
  const byId = new Map(items.map((i) => [i.id, i]))
  const tally = new Map()
  const add = (id, loved) => {
    const t = tally.get(id) ?? { loves: 0, rated: 0 }
    t.rated++
    if (loved) t.loves++
    tally.set(id, t)
  }
  for (const { ids = [], meh = [] } of loves) {
    const liked = new Set(ids)
    for (const id of liked) add(id, true)
    for (const id of new Set(meh)) if (!liked.has(id)) add(id, false)
  }
  return [...tally]
    .filter(([id, t]) => t.loves > 0 && byId.has(id))
    .map(([id, t]) => ({ item: byId.get(id), loves: t.loves, rated: t.rated, score: wilson(t.loves, t.rated) }))
    .sort((a, b) => b.score - a.score || b.loves - a.loves || (b.item.q ?? 0) - (a.item.q ?? 0))
    .slice(0, limit)
}

export async function fetchLoves(projectId) {
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/loves?pageSize=300`
  const out = []
  let token = ''
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(token ? `${base}&pageToken=${encodeURIComponent(token)}` : base)
    if (!res.ok) throw new Error(`loves: HTTP ${res.status}`)
    const body = await res.json()
    out.push(...decodeLoves(body))
    token = body.nextPageToken
    if (!token) break
  }
  return out
}

export function loadCachedLoves() {
  try {
    const loves = JSON.parse(localStorage.getItem(CACHE_KEY))
    return Array.isArray(loves) ? loves.filter((e) => e && Array.isArray(e.ids)).map((e) => ({ ...e, meh: Array.isArray(e.meh) ? e.meh : [] })) : []
  } catch {
    return []
  }
}

export function cacheLoves(loves) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(loves))
  } catch {
    // Storage blocked: fetched again next time.
  }
}
