import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeVault, isAdmin, vaultEntry } from './vault.js'

test('decodes the Firestore REST document into plain entries', () => {
  const doc = { fields: { items: { arrayValue: { values: [
    { mapValue: { fields: { id: { stringValue: 'tmdb:tv:1' }, name: { stringValue: 'Panchayat' }, poster: { stringValue: 'p.jpg' }, year: { integerValue: '2020' }, addedAt: { integerValue: '5' } } } },
    { mapValue: { fields: { id: { stringValue: 'tmdb:movie:2' }, name: { stringValue: 'Coco' }, poster: { nullValue: null } } } },
  ] } } } }
  assert.deepEqual(decodeVault(doc), [
    { id: 'tmdb:tv:1', name: 'Panchayat', poster: 'p.jpg', year: 2020, addedAt: 5 },
    { id: 'tmdb:movie:2', name: 'Coco', poster: null },
  ])
})

test('a missing or empty vault is an empty list', () => {
  assert.deepEqual(decodeVault(null), [])
  assert.deepEqual(decodeVault({}), [])
  assert.deepEqual(decodeVault({ fields: { items: { arrayValue: {} } } }), [])
})

test('only the configured account is the admin', () => {
  assert.equal(isAdmin({ uid: 'abc' }, 'abc'), true)
  assert.equal(isAdmin({ uid: 'xyz' }, 'abc'), false)
  assert.equal(isAdmin(null, 'abc'), false)
  assert.equal(isAdmin({ uid: 'abc' }, ''), false)
  assert.equal(isAdmin({ uid: '' }, ''), false)
})

test('a vault entry keeps its own name and poster', () => {
  const e = vaultEntry({ id: 'x', name: 'X', poster: 'x.jpg', year: 2001, q: 0.9, providers: ['netflix'] }, 7)
  assert.deepEqual(e, { id: 'x', name: 'X', poster: 'x.jpg', year: 2001, addedAt: 7 })
})
