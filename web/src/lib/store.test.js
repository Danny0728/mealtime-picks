import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalize } from './store.js'

test('older backups without seen ratings still load', () => {
  const s = normalize({ version: 1, seen: ['a'], history: [] })
  assert.deepEqual(s.seen, ['a'])
  assert.deepEqual(s.seenRatings, {})
})

test('seen ratings survive a round trip', () => {
  const s = normalize({ seen: ['a'], seenRatings: { a: 'liked' } })
  assert.deepEqual(s.seenRatings, { a: 'liked' })
})
