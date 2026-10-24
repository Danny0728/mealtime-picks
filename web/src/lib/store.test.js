import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalize } from './store.js'

test('older backups without seen ratings still load', () => {
  const s = normalize({ version: 1, seen: ['a'], history: [] })
  assert.deepEqual(s.seen, ['a'])
  assert.deepEqual(s.seenRatings, {})
  assert.deepEqual(s.watchlist, [])
  assert.equal(s.settings.theme, 'system')
  assert.equal(s.settings.otherLanguages, true)
  assert.deepEqual(s.stamps, {})
  assert.deepEqual(s.tombs, {})
  assert.equal(s.owner, null)
})

test('a new household starts with any length', () => {
  assert.equal(normalize({}).lastAsk.time, 'any')
})

test('old "who\'s watching" choices become age ratings', () => {
  assert.equal(normalize({ lastAsk: { who: 'family' } }).lastAsk.who, 'all')
  assert.equal(normalize({ lastAsk: { who: 'kids' } }).lastAsk.who, 'all')
  assert.equal(normalize({ lastAsk: { who: 'adults' } }).lastAsk.who, '18')
  assert.equal(normalize({ lastAsk: { who: '13' } }).lastAsk.who, '13')
  assert.equal(normalize({}).lastAsk.who, 'all')
})

test('a single saved mood becomes a list of moods', () => {
  assert.deepEqual(normalize({ lastAsk: { time: '30', mood: 'funny', who: 'kids' } }).lastAsk, { time: '30', moods: ['funny'], who: 'all' })
  assert.deepEqual(normalize({ lastAsk: { time: '30', mood: null, who: 'kids' } }).lastAsk.moods, [])
  assert.deepEqual(normalize({ lastAsk: { moods: ['funny', 'docu'] } }).lastAsk.moods, ['funny', 'docu'])
})

test('seen ratings survive a round trip', () => {
  const s = normalize({ seen: ['a'], seenRatings: { a: 'liked' } })
  assert.deepEqual(s.seenRatings, { a: 'liked' })
})
