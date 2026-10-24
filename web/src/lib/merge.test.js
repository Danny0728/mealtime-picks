import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adoptOnSignIn, mergeStores, pruneStore, stampChanges } from './merge.js'
import { normalize } from './store.js'

const S = (o) => normalize(o)

test('stampChanges records adds, removals and setting changes', () => {
  const a = S({ seen: ['x'] })
  const b = stampChanges(a, { ...a, seen: ['y'], settings: { ...a.settings, theme: 'dark' } }, 100)
  assert.equal(b.stamps['seen:y'], 100)
  assert.equal(b.tombs['seen:x'], 100)
  assert.equal(b.stamps.settings, 100)
  assert.equal(b.stamps['seen:x'], undefined)
})

test('stampChanges tracks ratings, watchlist and saved finds', () => {
  const a = S({ seenRatings: { r: 'ok' }, watchlist: [{ id: 'w', at: 1 }] })
  const b = stampChanges(a, { ...a, seenRatings: { r: 'liked' }, watchlist: [], saved: [{ text: 't', ids: [], at: 7 }] }, 50)
  assert.equal(b.stamps['rating:r'], 50)
  assert.equal(b.tombs['watch:w'], 50)
  assert.equal(b.stamps['saved:7'], 50)
})

test('merge is order-independent and idempotent', () => {
  const a = S({ seen: ['x'], stamps: { 'seen:x': 5 } })
  const b = S({ seen: ['y'], stamps: { 'seen:y': 6 } })
  assert.deepEqual(mergeStores(a, b), mergeStores(b, a))
  assert.deepEqual(mergeStores(a, a), a)
})

test('a stale device cannot bring back something removed later', () => {
  const phone = S({ seen: ['x'], stamps: { 'seen:x': 10 } })
  const laptop = S({ seen: [], tombs: { 'seen:x': 20 } })
  assert.deepEqual(mergeStores(phone, laptop).seen, [])
  assert.deepEqual(mergeStores(laptop, phone).seen, [])
})

test('newest rating wins', () => {
  const a = S({ seenRatings: { x: 'ok' }, stamps: { 'rating:x': 1 } })
  const b = S({ seenRatings: { x: 'liked' }, stamps: { 'rating:x': 2 } })
  assert.equal(mergeStores(a, b).seenRatings.x, 'liked')
  assert.equal(mergeStores(b, a).seenRatings.x, 'liked')
})

test('history entries are combined and feedback beats none', () => {
  const a = S({ history: [{ id: 'x', at: 1, status: 'picked', feedback: null }] })
  const b = S({ history: [{ id: 'x', at: 1, status: 'picked', feedback: 'liked' }, { id: 'y', at: 2, status: 'shown', feedback: null }] })
  const h = mergeStores(a, b).history
  assert.equal(h.length, 2)
  assert.equal(h[0].feedback, 'liked')
})

test('newer settings win', () => {
  const a = S({ settings: { theme: 'dark' }, stamps: { settings: 9 } })
  const b = S({ settings: { theme: 'light' }, stamps: { settings: 3 } })
  assert.equal(mergeStores(a, b).settings.theme, 'dark')
  assert.equal(mergeStores(b, a).settings.theme, 'dark')
})

test('old stores without stamps merge without losing anything', () => {
  const m = mergeStores(S({ seen: ['a'], watchlist: [{ id: 'w', at: 1 }] }), S({ seen: ['b'] }))
  assert.deepEqual([...m.seen].sort(), ['a', 'b'])
  assert.equal(m.watchlist.length, 1)
})

test('first sign-in with no account yet keeps the device data', () => {
  const s = adoptOnSignIn(S({ seen: ['a'] }), null, 'u1')
  assert.deepEqual(s.seen, ['a'])
  assert.equal(s.owner, 'u1')
})

test('signing in on a second device merges both', () => {
  const s = adoptOnSignIn(S({ seen: ['a'] }), S({ seen: ['b'] }), 'u1')
  assert.deepEqual(s.seen, ['a', 'b'])
})

test("someone else's device data is not merged into a new account", () => {
  const s = adoptOnSignIn(S({ seen: ['a'], owner: 'u1' }), S({ seen: ['b'] }), 'u2')
  assert.deepEqual(s.seen, ['b'])
  assert.equal(s.owner, 'u2')
})

test('pruneStore drops old tombs and caps history', () => {
  const now = 200 * 864e5
  const history = Array.from({ length: 1200 }, (_, i) => ({ id: 'h', at: i, status: 'shown' }))
  const s = pruneStore(S({ tombs: { 'seen:old': 1, 'seen:new': now - 864e5 }, history }), now)
  assert.deepEqual(Object.keys(s.tombs), ['seen:new'])
  assert.equal(s.history.length, 1000)
  assert.equal(s.history.at(-1).at, 1199)
})
