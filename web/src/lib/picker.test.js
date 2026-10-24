import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pick, fit, timeById, updateWeights, certAge, DEFAULT_WEIGHTS } from './picker.js'

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
  const s = store({ seen: ['seen'] })
  s.settings.otherLanguages = false
  const { picks } = pick(cat, s, { time: '45', mood: null, who: 'family' }, seq(0.9))
  assert.deepEqual(picks.map((p) => p.items[0].id), ['ok'])
})

test('vault titles get a small boost and say so, but still obey filters', () => {
  const cat = { items: [item('vaulted', { q: 0.5, genres: ['Drama'] }), item('other', { q: 0.55, genres: ['Comedy'] }), item('tamil', { lang: 'ta', q: 0.5 })] }
  const s = store({ vault: ['vaulted', 'tamil'] })
  s.settings.otherLanguages = false
  const { picks } = pick(cat, s, { time: 'any', moods: [], who: '18' }, seq(0.9))
  assert.equal(picks[0].items[0].id, 'vaulted')
  assert.match(picks[0].reason, /From the Vault/)
  assert.ok(!picks.some((p) => p.items[0].id === 'tamil'), 'a vault title still respects the language filter')
})

test('certificates read as ages', () => {
  assert.equal(certAge('U'), 0)
  assert.equal(certAge('U/A 7+'), 7)
  assert.equal(certAge('UA 13+'), 13)
  assert.equal(certAge('UA'), 13)
  assert.equal(certAge('UA 16+'), 16)
  assert.equal(certAge('A'), 18)
  assert.equal(certAge('TV-MA'), 18)
  assert.equal(certAge(''), null)
  assert.equal(certAge('weird'), null)
})

test('age rating chips: U, 13+, 18+', () => {
  const cat = { items: [
    item('u', { cert: 'U' }),
    item('ua13', { cert: 'UA 13+', safe: false }),
    item('ua16', { cert: 'UA 16+', safe: false }),
    item('a', { cert: 'A', safe: false }),
    item('unrated-safe', { cert: undefined, genres: ['Drama'] }),
    item('unrated-dark', { cert: undefined, safe: false, genres: ['Crime'] }),
  ] }
  // Each title on its own: can it be picked at this rating?
  const allowedIds = (who) => cat.items
    .filter((it) => pick({ items: [it] }, store(), { time: 'any', moods: [], who }, seq(0.9)).picks.length > 0)
    .map((it) => it.id)
  assert.deepEqual(allowedIds('all'), ['u', 'unrated-safe'])
  assert.deepEqual(allowedIds('13'), ['u', 'ua13', 'unrated-safe'])
  assert.deepEqual(allowedIds('18'), ['u', 'ua13', 'ua16', 'a', 'unrated-safe', 'unrated-dark'])
  // "Family-safe only" in Setup still wins over 18+.
  const strict = store()
  strict.settings.familySafe = true
  assert.deepEqual(cat.items.filter((it) => pick({ items: [it] }, strict, { time: 'any', moods: [], who: '18' }, seq(0.9)).picks.length).map((it) => it.id), ['u', 'unrated-safe'])
})

test('other languages are allowed, but yours win a tie', () => {
  const cat = { items: [item('korean', { lang: 'ko', genres: ['Drama'] }), item('hindi', { genres: ['Comedy'] })] }
  const { picks } = pick(cat, store(), { time: '45', moods: [], who: 'adults' }, seq(0.9))
  assert.deepEqual(picks.map((p) => p.items[0].id), ['hindi', 'korean'])
})

test('a standout subtitled title beats an average one in your language', () => {
  const cat = { items: [item('parasite', { lang: 'ko', q: 0.9, gem: 0.9, genres: ['Thriller'] }), item('hindi', { genres: ['Comedy'] })] }
  const { picks } = pick(cat, store(), { time: '45', moods: [], who: 'adults' }, seq(0.9))
  assert.equal(picks[0].items[0].id, 'parasite')
})

test('turning other languages off brings back the strict filter', () => {
  const cat = { items: [item('parasite', { lang: 'ko', q: 0.9 }), item('hindi')] }
  const s = store()
  s.settings.otherLanguages = false
  const { picks } = pick(cat, s, { time: '45', moods: [], who: 'adults' }, seq(0.9))
  assert.deepEqual(picks.map((p) => p.items[0].id), ['hindi'])
})

test('the Anime mood finds anime even though Japanese is not one of your languages', () => {
  const cat = { items: [
    item('deathnote', { lang: 'ja', moods: { anime: 1 }, genres: ['Animation'] }),
    ...['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((id) => item(id, { moods: { funny: 0.8 } })),
  ] }
  const { picks } = pick(cat, store(), { time: '45', moods: ['anime'], who: 'adults' }, seq(0.9))
  assert.equal(picks[0].items[0].id, 'deathnote')
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

test('several moods mean any of them, not all of them', () => {
  const cat = { items: [
    ...['f1', 'f2', 'f3'].map((id) => item(id, { moods: { funny: 0.8 }, genres: [id] })),
    ...['t1', 't2', 't3'].map((id) => item(id, { moods: { thriller: 0.8 }, genres: [id] })),
    ...['d1', 'd2', 'd3'].map((id) => item(id, { moods: { docu: 0.9 }, q: 0.95, genres: [id] })),
  ] }
  const { picks, moodMatched } = pick(cat, store(), { time: '45', moods: ['funny', 'thriller'], who: 'adults' }, seq(0.9))
  assert.equal(picks.length, 3)
  assert.ok(moodMatched)
  const ids = picks.map((p) => p.items[0].id)
  assert.ok(ids.every((id) => /^[ft]/.test(id)), `only funny or thriller titles, got ${ids}`)
  assert.ok(ids.some((id) => id[0] === 'f') && ids.some((id) => id[0] === 't'), `both moods represented, got ${ids}`)
})

test('no moods selected means any mood', () => {
  const cat = { items: [item('a', { moods: {} }), item('b', { moods: { docu: 0.9 } })] }
  const { picks } = pick(cat, store(), { time: '45', moods: [], who: 'adults' }, seq(0.9))
  assert.equal(picks.length, 2)
})

test('Any length lets in long films, short videos and series alike, ranked on content', () => {
  const cat = { items: [
    item('epic', { runtime: 170, q: 0.9 }),
    item('show', { kind: 'tv', epMin: 55, q: 0.6, genres: ['Drama'] }),
    item('clip', { kind: 'youtube', providers: ['youtube'], runtime: 12, q: 0.5, lang: '', genres: ['Comedy'] }),
  ] }
  const { picks } = pick(cat, store(), { time: 'any', moods: [], who: 'adults' }, seq(0.9))
  assert.equal(picks.length, 3)
  assert.equal(picks[0].items[0].id, 'epic')
  const show = picks.find((p) => p.items[0].id === 'show')
  assert.equal(show.episodes, 1)
  assert.ok(picks.every((p) => p.kind !== 'combo'))
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

test('a seen title rated "loved" pulls similar ones up', () => {
  const cat = { items: [
    item('watched', { sim: ['twin'] }),
    item('twin', { q: 0.4, sim: ['watched'] }),
    item('other', { q: 0.5 }),
  ] }
  const s = store({ seen: ['watched'], seenRatings: { watched: 'liked' } })
  const { picks } = pick(cat, s, { time: '45', mood: null, who: 'adults' }, seq(0.9))
  assert.ok(!picks.some((p) => p.items[0].id === 'watched'))
  assert.equal(picks[0].items[0].id, 'twin')
  assert.match(picks[0].reason, /Close to watched/)
})

test('a seen title rated "ok" only hides it', () => {
  const cat = { items: [
    item('watched', { sim: ['twin'] }),
    item('twin', { q: 0.4, sim: ['watched'] }),
    item('other', { q: 0.5 }),
  ] }
  const ask = { time: '45', mood: null, who: 'adults' }
  const plain = pick(cat, store({ seen: ['watched'] }), ask, seq(0.9)).picks
  const ok = pick(cat, store({ seen: ['watched'], seenRatings: { watched: 'ok' } }), ask, seq(0.9)).picks
  assert.deepEqual(ok.map((p) => [p.key, p.score]), plain.map((p) => [p.key, p.score]))
})

test('watchlisted titles are not picked but nudge similar ones up', () => {
  const cat = { items: [
    item('saved', { sim: ['twin'] }),
    item('twin', { q: 0.4, sim: ['saved'] }),
    item('other', { q: 0.5 }),
  ] }
  const ask = { time: '45', mood: null, who: 'adults' }
  const { picks } = pick(cat, store({ watchlist: [{ id: 'saved', at: 1 }] }), ask, seq(0.9))
  assert.ok(!picks.some((p) => p.items[0].id === 'saved'))
  const twin = picks.find((p) => p.items[0].id === 'twin')
  assert.equal(picks[0], twin)
  assert.match(twin.reason, /Close to saved, which you saved/)
  // Weaker than actually loving it.
  const loved = pick(cat, store({ seen: ['saved'], seenRatings: { saved: 'liked' } }), ask, seq(0.9)).picks
  assert.ok(twin.factors.p < loved.find((p) => p.items[0].id === 'twin').factors.p)
})

test('kept picks stay put and the free slot gets a new title', () => {
  const cat = { items: ['a', 'b', 'c', 'd', 'e'].map((id, i) => item(id, { q: 0.9 - i * 0.1, genres: [id] })) }
  const ask = { time: '45', mood: null, who: 'adults' }
  const first = pick(cat, store(), ask, seq(0.9)).picks
  assert.equal(first.length, 3)
  const shown = first.map((p) => p.key)
  // The family has seen the middle one; the other two are kept.
  const keep = [first[0], first[2]]
  const { picks } = pick(cat, store({ seen: shown }), ask, seq(0.9), keep)
  assert.equal(picks.length, 3)
  assert.equal(picks[0], first[0])
  assert.equal(picks[1], first[2])
  assert.ok(!shown.includes(picks[2].key), 'the replacement should be something not shown yet')
})

test('continue a liked series with the next episodes', () => {
  const cat = { items: [item('show', { kind: 'tv', epMin: 22 }), item('x')] }
  const s = store({ history: [{ id: 'show', status: 'picked', feedback: 'liked', at: Date.now(), ep: { from: 1, to: 2 } }] })
  const { picks } = pick(cat, s, { time: '45', mood: null, who: 'adults' }, seq(0.9))
  assert.equal(picks[0].kind, 'continue')
  assert.equal(picks[0].epFrom, 3)
})

test('with Any length, continuing a series means the next single episode', () => {
  const cat = { items: [item('show', { kind: 'tv', epMin: 22 }), item('x')] }
  const s = store({ history: [{ id: 'show', status: 'picked', feedback: 'liked', at: Date.now(), ep: { from: 1, to: 2 } }] })
  const { picks } = pick(cat, s, { time: 'any', moods: [], who: 'adults' }, seq(0.9))
  assert.equal(picks[0].kind, 'continue')
  assert.equal(picks[0].epFrom, 3)
  assert.match(picks[0].reason, /episode 3\./)
})

test('weights move toward what a liked pick was good at', () => {
  const w = updateWeights(DEFAULT_WEIGHTS, { q: 0.2, r: 0.2, p: 1, g: 0.2, f: 0.2 }, 'liked')
  assert.ok(w.p > DEFAULT_WEIGHTS.p)
  const sum = Object.values(w).reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(sum - 1) < 0.01)
})
