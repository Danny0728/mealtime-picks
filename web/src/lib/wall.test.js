import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WALL_PER_ROW, WALL_POSTERS, WALL_ROWS, wallPosters, wallRows } from './wall.js'

const it = (id, o) => ({ id, kind: 'movie', poster: `https://image.tmdb.org/t/p/w342/${id}.jpg`, q: 0.5, ...o })
const idOf = (url) => url.match(/\/([^/]+)\.jpg$/)[1]
const emptyish = { history: [], seenRatings: {}, saved: [], watchlist: [] }
const many = (n) => Array.from({ length: n }, (_, i) => it(`m${i}`))

test('loved first, then watchlist, then popular by quality; no dupes, no YouTube', () => {
  const items = [
    it('pop-lo', { popular: true, q: 0.2 }), it('pop-hi', { popular: true, q: 0.9 }),
    it('loved'), it('saved'), it('yt', { kind: 'youtube' }), it('noposter', { poster: '' }), it('rest', { q: 0.5 }),
  ]
  const store = { history: [{ id: 'loved', feedback: 'liked' }], seenRatings: {}, saved: [], watchlist: [{ id: 'saved' }, { id: 'loved' }] }
  assert.deepEqual(wallPosters(items, store).map(idOf), ['loved', 'saved', 'pop-hi', 'pop-lo', 'rest'])
})

test('seen titles rated "loved" and Instagram finds count as loved', () => {
  const items = [it('pop', { popular: true, q: 0.9 }), it('seenLoved'), it('insta')]
  const store = { ...emptyish, seenRatings: { seenLoved: 'liked' }, saved: [{ ids: ['insta'] }] }
  assert.deepEqual(wallPosters(items, store).map(idOf), ['seenLoved', 'insta', 'pop'])
})

test('uses the small poster size', () => assert.match(wallPosters([it('a')], emptyish)[0], /\/w185\//))

test('respects the limit', () => assert.equal(wallPosters(many(40), emptyish, 24).length, 24))

test('empty catalog gives no posters and no rows', () => {
  assert.deepEqual(wallPosters([], emptyish), [])
  assert.deepEqual(wallRows([]), [])
})

test('the laptop wall gets five full rows of distinct posters when the catalog allows', () => {
  const posters = wallPosters(many(60), emptyish, WALL_POSTERS)
  assert.equal(posters.length, 40)
  const rows = wallRows(posters, WALL_ROWS, WALL_PER_ROW)
  assert.equal(rows.length, 5)
  assert.equal(new Set(rows.flat()).size, 40)
})

test('a short list still fills every row', () => {
  const rows = wallRows(['a', 'b', 'c'], 3, 8)
  assert.equal(rows.length, 3)
  for (const r of rows) assert.equal(r.length, 8)
})
