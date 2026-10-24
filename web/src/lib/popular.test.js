import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeLoves, myRatings, popularList, wilson, withMine } from './popular.js'

const it = (id, o) => ({ id, kind: 'movie', q: 0.5, ...o })
const ids = (list) => list.map((e) => e.item.id)
let n = 0
const person = (loved, meh = []) => ({ uid: `u${n++}`, ids: loved, meh })

test('my ratings: loved vs anything else, latest wins, seen ratings last', () => {
  const store = {
    history: [
      { id: 'a', feedback: 'liked' }, { id: 'b', feedback: 'disliked' }, { id: 'c', feedback: 'liked' },
      { id: 'c', feedback: 'unfinished' }, { id: 'd', feedback: null },
    ],
    seenRatings: { e: 'liked', f: 'ok', b: 'liked' },
  }
  assert.deepEqual(myRatings(store), { ids: ['a', 'b', 'e'], meh: ['c', 'f'] })
  assert.deepEqual(myRatings({}), { ids: [], meh: [] })
})

test('only titles someone loved; one vote per person; not in the catalog skipped', () => {
  const items = [it('a'), it('b'), it('onlymeh'), it('c')]
  const list = popularList([person(['a', 'a', 'gone']), person(['a', 'b'], ['onlymeh'])], items)
  assert.deepEqual(ids(list), ['a', 'b'])
  assert.deepEqual(popularList([], items), [])
})

test('loves out of ratings: 3 of 3 beats 4 of 10', () => {
  const items = [it('sure'), it('mixed')]
  const loves = [
    ...Array.from({ length: 3 }, () => person(['sure', 'mixed'])),
    person(['mixed']),
    ...Array.from({ length: 6 }, () => person([], ['mixed'])),
  ]
  const list = popularList(loves, items)
  assert.deepEqual(list.map((e) => [e.item.id, e.loves, e.rated]), [['sure', 3, 3], ['mixed', 4, 10]])
})

test('a handful of votes cannot top many: 20 of 25 beats 2 of 2', () => {
  const items = [it('few'), it('many')]
  const loves = [
    ...Array.from({ length: 20 }, (_, i) => person(i < 2 ? ['many', 'few'] : ['many'])),
    ...Array.from({ length: 5 }, () => person([], ['many'])),
  ]
  assert.deepEqual(ids(popularList(loves, items)), ['many', 'few'])
})

test('loved and rated meh by the same person counts as loved', () => {
  const list = popularList([person(['x'], ['x'])], [it('x')])
  assert.deepEqual(list.map((e) => [e.loves, e.rated]), [[1, 1]])
})

test('same score: more loves, then the better recommendation', () => {
  const items = [it('meh', { q: 0.3 }), it('great', { q: 0.95 })]
  assert.deepEqual(ids(popularList([person(['meh', 'great'])], items)), ['great', 'meh'])
})

test('wilson: cautious with few ratings, between 0 and 1', () => {
  assert.ok(wilson(3, 3) > wilson(1, 1))
  assert.ok(wilson(20, 25) > wilson(3, 3))
  assert.ok(wilson(5, 5) > wilson(5, 10))
  assert.equal(wilson(0, 10), 0)
  assert.equal(wilson(1, 0), 0)
  for (const [l, r] of [[1, 1], [5, 9], [30, 30]]) assert.ok(wilson(l, r) > 0 && wilson(l, r) < 1)
})

test('limit kept', () => {
  const items = Array.from({ length: 5 }, (_, i) => it(`t${i}`))
  assert.equal(popularList([person(items.map((i) => i.id))], items, 3).length, 3)
})

test('decodes a Firestore REST page; older documents without meh still load', () => {
  const list = (...v) => ({ arrayValue: { values: v.map((stringValue) => ({ stringValue })) } })
  const page = {
    documents: [
      { name: 'x/loves/u1', fields: { ids: list('tmdb:tv:1'), meh: list('tmdb:movie:2') } },
      { name: 'x/loves/u2', fields: { ids: { arrayValue: {} } } },
      { name: 'x/loves/u3', fields: {} },
    ],
  }
  assert.deepEqual(decodeLoves(page), [
    { uid: 'u1', ids: ['tmdb:tv:1'], meh: ['tmdb:movie:2'] },
    { uid: 'u2', ids: [], meh: [] },
  ])
  assert.deepEqual(decodeLoves({}), [])
})

test("this person's own ratings replace their saved ones; signed out changes nothing", () => {
  const loves = [{ uid: 'a', ids: ['x'], meh: [] }, { uid: 'b', ids: ['y'], meh: [] }]
  assert.deepEqual(withMine(loves, 'a', { ids: ['z'], meh: ['w'] }), [{ uid: 'b', ids: ['y'], meh: [] }, { uid: 'a', ids: ['z'], meh: ['w'] }])
  assert.equal(withMine(loves, 'new', { ids: [], meh: [] }).length, 3)
  assert.equal(withMine(loves, null, { ids: ['q'], meh: [] }), loves)
})
