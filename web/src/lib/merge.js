// Keeping one person's data the same on every device. Every change records
// when it happened (stamps) and removals are remembered too (tombs), so two
// copies can always be combined: the newest event per item wins, and a
// device that was offline for days can't undo what happened elsewhere.
// mergeStores is order-independent and merging a store with itself is a no-op.
import { normalize } from './store.js'

const DAY = 864e5
const TOMB_DAYS = 90
const MAX_HISTORY = 1000
const WHOLE = ['settings', 'lastAsk', 'weights']

const json = (v) => JSON.stringify(v ?? null)
const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

// Per-item collections: how to read them into key -> value and write them back.
const KINDS = {
  seen: {
    read: (s) => new Map((s.seen ?? []).map((id) => [id, id])),
    write: (m) => ({ seen: [...m.keys()].sort(byKey) }),
  },
  rating: {
    read: (s) => new Map(Object.entries(s.seenRatings ?? {})),
    write: (m) => ({ seenRatings: Object.fromEntries([...m.entries()].sort(([a], [b]) => byKey(a, b))) }),
  },
  watch: {
    read: (s) => new Map((s.watchlist ?? []).map((w) => [w.id, w])),
    write: (m) => ({ watchlist: [...m.values()].sort((a, b) => (a.at ?? 0) - (b.at ?? 0) || byKey(a.id, b.id)) }),
  },
  saved: {
    read: (s) => new Map((s.saved ?? []).map((x) => [String(x.at ?? x.url ?? x.text), x])),
    write: (m) => ({ saved: [...m.values()].sort((a, b) => (a.at ?? 0) - (b.at ?? 0) || byKey(json(a), json(b))) }),
  },
}

export function stampChanges(prev, next, now) {
  const stamps = { ...(next.stamps ?? {}) }
  const tombs = { ...(next.tombs ?? {}) }
  const mark = (key, removed) => {
    if (removed) {
      tombs[key] = now
      delete stamps[key]
    } else {
      stamps[key] = now
      delete tombs[key]
    }
  }
  for (const [kind, { read }] of Object.entries(KINDS)) {
    const before = read(prev)
    const after = read(next)
    for (const [id, v] of after) if (!before.has(id) || json(before.get(id)) !== json(v)) mark(`${kind}:${id}`, false)
    for (const id of before.keys()) if (!after.has(id)) mark(`${kind}:${id}`, true)
  }
  for (const k of WHOLE) if (json(prev[k]) !== json(next[k])) mark(k, false)
  return { ...next, stamps, tombs }
}

// When a side last touched a key: its stamp, or 0 for an item an older
// store holds without one, or -1 when it has never heard of it.
const stampOf = (s, key, has) => s.stamps?.[key] ?? (has ? 0 : -1)
const tombOf = (s, key) => s.tombs?.[key] ?? -1

// Equal times: pick by content so either merge order gives the same answer.
function pickTie(va, vb, hasA, hasB) {
  if (!hasB) return va
  if (!hasA) return vb
  return json(va) >= json(vb) ? va : vb
}

export function mergeStores(a, b) {
  const out = { ...a }
  for (const [kind, { read, write }] of Object.entries(KINDS)) {
    const ma = read(a)
    const mb = read(b)
    const prefix = `${kind}:`
    const ids = new Set([...ma.keys(), ...mb.keys()])
    for (const src of [a.stamps, b.stamps, a.tombs, b.tombs]) {
      for (const k of Object.keys(src ?? {})) if (k.startsWith(prefix)) ids.add(k.slice(prefix.length))
    }
    const merged = new Map()
    for (const id of ids) {
      const key = prefix + id
      const sa = stampOf(a, key, ma.has(id))
      const sb = stampOf(b, key, mb.has(id))
      if (Math.max(sa, sb) <= Math.max(tombOf(a, key), tombOf(b, key))) continue // removed last
      const v = sa > sb && ma.has(id) ? ma.get(id) : sb > sa && mb.has(id) ? mb.get(id) : pickTie(ma.get(id), mb.get(id), ma.has(id), mb.has(id))
      if (v !== undefined) merged.set(id, v)
    }
    Object.assign(out, write(merged))
  }
  for (const k of WHOLE) {
    const sa = a.stamps?.[k] ?? 0
    const sb = b.stamps?.[k] ?? 0
    out[k] = sa > sb ? a[k] : sb > sa ? b[k] : pickTie(a[k], b[k], true, true)
  }
  out.history = mergeHistory(a.history ?? [], b.history ?? [])
  out.stamps = maxOf(a.stamps, b.stamps)
  out.tombs = maxOf(a.tombs, b.tombs)
  return out
}

function mergeHistory(ha, hb) {
  const keyOf = (h) => `${h.id}|${h.at}|${h.status}`
  const m = new Map()
  for (const h of [...ha, ...hb]) {
    const k = keyOf(h)
    const cur = m.get(k)
    if (!cur) m.set(k, h)
    else if (cur.feedback == null && h.feedback != null) m.set(k, h)
    else if (cur.feedback != null && h.feedback != null && json(h) > json(cur)) m.set(k, h)
  }
  return [...m.values()].sort((x, y) => (x.at ?? 0) - (y.at ?? 0) || byKey(keyOf(x), keyOf(y))).slice(-MAX_HISTORY)
}

function maxOf(x = {}, y = {}) {
  const out = {}
  for (const k of [...new Set([...Object.keys(x), ...Object.keys(y)])].sort(byKey)) out[k] = Math.max(x[k] ?? -1, y[k] ?? -1)
  return out
}

export function pruneStore(s, now) {
  const tombs = Object.fromEntries(Object.entries(s.tombs ?? {}).filter(([, at]) => now - at <= TOMB_DAYS * DAY))
  return { ...s, tombs, history: (s.history ?? []).slice(-MAX_HISTORY) }
}

// The first sync on this device for `uid`. A device holding someone else's
// data switches to this account's; otherwise both copies are combined.
export function adoptOnSignIn(local, remote, uid) {
  if (!remote) return { ...local, owner: uid }
  if (local.owner && local.owner !== uid) return { ...normalize(remote), owner: uid }
  return { ...mergeStores(local, normalize(remote)), owner: uid }
}
