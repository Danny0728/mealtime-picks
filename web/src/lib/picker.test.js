import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pick, fit, timeById, updateWeights, DEFAULT_WEIGHTS } from './picker.js'

const item = (id, o) => ({
  id, kind: 'movie', name: id, lang: 'hi', providers: ['netflix'], safe: true,
  q: 0.5, gem: 0.5, moods: { feelgood: 0.6 }, sim: [], genres: ['Comedy'], runtime: 50, ...o,
})

const store = (o = {}) => ({
  settings: { platforms: ['netflix', 'youtube'], languages: ['hi', 'en'], familySafe: false },
  history: [], seen: [], saved: [], ...o,
})

const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length] }

test('fit: series fill the slot with episodes, long films are out', () => {
  assert.equal(fit({ kind: 'tv', epMin: 24 }, timeById('45')).episodes, 2)
  assert.equal(fit({ kind: 'movie', runtime: 150 }, timeById('45')).score, 0)
})

test('filters platforms, language, safety and already-seen', () => {
  const cat = { items: [
    item('ok'),
    item('prime', { providers: ['prime'] }),
    item('tamil', { lang: 'ta' }),
    item('unsafe', { safe: false }),
    item('seen'),
  ] }
  const { picks } = pick(cat, store({ seen: ['seen'] }), { time: '45', mood: null, who: 'family' }, seq(0.9))
  assert.deepEqual(picks.map((p) => p.items[0].id), ['ok'])
})

test('three different picks, best first', () => {
  const cat = { items: [
    item('a', { q: 0.9, sim: ['b'] }),
    item('b', { q: 0.88, sim: ['a'] }),
    item('c', { q: 0.6, genres: ['Documentary'], moods: { feelgood: 0.3 } }),
    item('d', { q: 0.2 }),
  ] }
  const { picks } = pick(cat, store(), { time: '45', mood: 'feelgood', who: 'adults' }, seq(0.9))
  assert.equal(picks.length, 3)
  assert.equal(picks[0].items[0].id, 'a')
  assert.equal(picks[1].items[0].id, 'c', 'MMR should prefer the different title over the near-duplicate')
})

test('two short videos are combined to fill the time', () => {
  const v = (id, m) => item(id, { kind: 'youtube', providers: ['youtube'], runtime: m, moods: { standup: 0.9 }, lang: '' })
  const cat = { items: [v('y1', 20), v('y2', 22), v('y3', 18)] }
  const { picks } = pick(cat, store(), { time: '45', mood: 'standup', who: 'adults' }, seq(0.9))
  assert.ok(picks.some((p) => p.kind === 'combo' && p.minutes >= 30 && p.minutes <= 52))
})

test('liked titles pull similar ones up', () => {
  const cat = { items: [
    item('liked', { sim: ['twin'] }),
    item('twin', { q: 0.4, sim: ['liked'] }),
    item('other', { q: 0.5 }),
  ] }
  const s = store({ history: [{ id: 'liked', status: 'picked', feedback: 'liked', at: Date.now() }] })
  const { picks } = pick(cat, s, { time: '45', mood: null, who: 'adults' }, seq(0.9))
  assert.equal(picks[0].items[0].id, 'twin')
  assert.match(picks[0].reason, /which you liked/)
})

test('continue a liked series with the next episodes', () => {
  const cat = { items: [item('show', { kind: 'tv', epMin: 22 }), item('x')] }
  const s = store({ history: [{ id: 'show', status: 'picked', feedback: 'liked', at: Date.now(), ep: { from: 1, to: 2 } }] })
  const { picks } = pick(cat, s, { time: '45', mood: null, who: 'adults' }, seq(0.9))
  assert.equal(picks[0].kind, 'continue')
  assert.equal(picks[0].epFrom, 3)
})

test('weights move toward what a liked pick was good at', () => {
  const w = updateWeights(DEFAULT_WEIGHTS, { q: 0.2, r: 0.2, p: 1, g: 0.2, f: 0.2 }, 'liked')
  assert.ok(w.p > DEFAULT_WEIGHTS.p)
  const sum = Object.values(w).reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(sum - 1) < 0.01)
})
