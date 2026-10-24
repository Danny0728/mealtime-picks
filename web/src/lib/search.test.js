import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchCatalog } from './search.js'

const it = (id, name, o) => ({ id, name, q: 0.5, ...o })
const items = [
  it('a', 'The Dark Knight', { q: 0.9 }),
  it('b', 'Dark', { q: 0.4 }),
  it('c', 'Darkest Hour', { q: 0.6 }),
  it('d', 'Kaun Banega', { altNames: ['Who Will Be'] }),
  it('e', 'Panchayat', { q: 0.8 }),
]

test('prefix matches beat substring matches, then quality', () => {
  assert.deepEqual(searchCatalog(items, 'dark').map((x) => x.id), ['c', 'b', 'a'])
})

test('case-insensitive, matches alternative titles', () => {
  assert.deepEqual(searchCatalog(items, 'WHO WILL').map((x) => x.id), ['d'])
  assert.deepEqual(searchCatalog(items, 'panch').map((x) => x.id), ['e'])
})

test('nothing under 2 characters, capped at 30', () => {
  assert.deepEqual(searchCatalog(items, 'd'), [])
  assert.deepEqual(searchCatalog(items, '  '), [])
  const many = Array.from({ length: 50 }, (_, i) => it(`m${i}`, `Movie ${i}`))
  assert.equal(searchCatalog(many, 'movie').length, 30)
})
