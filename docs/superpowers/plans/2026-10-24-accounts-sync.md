# Accounts and Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Project rule (owner's standing instruction):** never run `git commit`, create branches, merge or push. Leave every change uncommitted. This overrides the skill's commit steps, so this plan has none.

**Goal:** Optional "Sign in with Google" that keeps each person's seen list, ratings, watchlist, saved finds, settings and history the same on all their devices.

**Architecture:**
- **Change tracking:** every store change goes through `App`'s `update()`, which already exists. A pure `stampChanges(prev, next, now)` diffs the two and records per-item timestamps and tombstones, so no call site changes.
- **Merging:** a pure `mergeStores(a, b)` combines two stores. It's order-independent and merging a store with itself changes nothing.
- **Sync:** `lib/sync.js` lazy-loads the Firebase SDK (dynamic `import()`). It signs in with a pop-up and keeps `users/{uid}` and the local store converged through `mergeStores`.

**Tech Stack:** React 19, Vite 8, `firebase` JS SDK (modular: `firebase/app`, `firebase/auth`, `firebase/firestore`), `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-24-accounts-sync-design.md`

## Global Constraints

- Firestore document path is `users/{uid}`. The rules allow read and write only when `request.auth.uid == uid`.
- Sign-in uses `signInWithPopup` with `GoogleAuthProvider`. **Never** `signInWithRedirect`.
- Signed-out users must not download any Firebase code. Firebase is imported only inside `lib/sync.js`, via dynamic `import()`.
- Signing in is optional. Signed-out behaviour is exactly today's.
- Tombstones older than 90 days are pruned. History stays capped at 1000 (`MAX_HISTORY` in `store.js`).
- Local writes are pushed to Firestore debounced by about 1000 ms, always as `mergeStores(remote, local)`.
- Firestore rejects `undefined` field values, so documents must be written after `JSON.parse(JSON.stringify(...))`.
- No `git commit`, branch, merge or push.

## Review Focus

1. **A second person signs in on the same device** (A signs out, B signs in). B's account must **not** absorb A's local data. The device switches to B's data. *(Task 1 test: `adoptOnSignIn` with a different `owner`.)*
2. **First-ever sign-in with no document in Firestore yet.** The local store becomes the account, with nothing lost. *(Task 1 test: `adoptOnSignIn(local, null, uid)`.)*
3. **A device offline for days comes back** with stale data and an old un-mark. Newer changes from the other device survive, and removals stay removed. *(Task 1 tests: newest-wins and tombstone.)*
4. **The document grows over months.** Tombstones older than 90 days are dropped and history stays at 1000 or fewer, keeping it well under 1 MB. *(Task 1 test: `pruneStore`.)*
5. **Signed-out first load.** No Firebase JavaScript in the entry bundle. *(Task 3 verification: grep of the built entry chunk.)*

---

### Task 1: Stamps, merge and sign-in adoption (pure logic)

**Files:**
- Create: `web/src/lib/merge.js`, `web/src/lib/merge.test.js`
- Modify: `web/src/lib/store.js` (`emptyStore`, `normalize`), `web/src/lib/store.test.js`

**Interfaces:**
- **New store fields** (in `emptyStore()`, defaulted by `normalize`):
  - `stamps: Record<string, number>`: last add or change time per key.
  - `tombs: Record<string, number>`: removal time per key.
  - `owner: string | null`: the uid whose data this device holds; `null` while signed out and never synced.
- **Keys:** `seen:<id>`, `rating:<id>`, `watch:<id>`, `saved:<at>`, plus the whole-object keys `settings`, `lastAsk`, `weights`.
- **Produces:**
  - `stampChanges(prev: Store, next: Store, now: number) → Store`. Compares the seen ids, the `seenRatings` entries (added, changed or removed), the watchlist ids, the saved finds (keyed by their `at`), and deep-compares `settings`, `lastAsk` and `weights`. It returns `next` with `stamps[key] = now` for adds and changes, `tombs[key] = now` for removals, and clears the opposite map's entry for that key. History needs no stamps.
  - `mergeStores(a: Store, b: Store) → Store`.
    - **Per key** across `seen`, `rating`, `watch` and `saved`: take the newest of `a.stamps[k]`, `b.stamps[k]`, `a.tombs[k]` and `b.tombs[k]`. If it's a tomb, the item is absent. Otherwise the item comes from the side whose stamp is newest.
    - **Ties:** pick the side whose item serialises to the larger JSON string, so the result is symmetric.
    - **History:** combine, keyed by `${id}|${at}|${status}`. An entry with non-null `feedback` beats null. Two different feedbacks resolve to the larger string. Sort by `at` and cap at the last 1000.
    - **`settings`, `lastAsk`, `weights`:** the newer `stamps[...]` wins (tie: larger JSON).
    - **Everything else** (`version`, `owner`) comes from `a`. Output `stamps` and `tombs` are the per-key maxima of both inputs.
    - **Fixed order, so `merge(a, b)` deep-equals `merge(b, a)`:** `seen` is sorted by id, `watchlist` and `saved` by `at` and then id or text, history by `at` and then key, and `seenRatings` keys are inserted in sorted order.
  - `pruneStore(s: Store, now: number) → Store`: drops tombs older than `90 * 864e5` and caps history at 1000.
  - `adoptOnSignIn(local: Store, remote: Store | null, uid: string) → Store`.
    - `remote === null`: return `{ ...local, owner: uid }`.
    - `local.owner` set and `!== uid`: return `{ ...normalize(remote), owner: uid }`. The other person's data stays on their account, not this one.
    - Otherwise: return `{ ...mergeStores(local, normalize(remote)), owner: uid }`.

- [ ] **Step 1: Write failing tests** in `merge.test.js`. Use a helper `S(o)` that returns `normalize(o)`.
```js
test('stampChanges records adds, removals and setting changes', () => {
  const a = S({ seen: ['x'] })
  const b = stampChanges(a, { ...a, seen: ['y'], settings: { ...a.settings, theme: 'dark' } }, 100)
  assert.equal(b.stamps['seen:y'], 100); assert.equal(b.tombs['seen:x'], 100); assert.equal(b.stamps.settings, 100)
})
test('merge is order-independent and idempotent', () => {
  const a = S({ seen: ['x'], stamps: { 'seen:x': 5 } }), b = S({ seen: ['y'], stamps: { 'seen:y': 6 } })
  assert.deepEqual(mergeStores(a, b), mergeStores(b, a))
  assert.deepEqual(mergeStores(a, a), a)
})
test('a stale device cannot bring back something removed later', () => {
  const phone = S({ seen: ['x'], stamps: { 'seen:x': 10 } })
  const laptop = S({ seen: [], tombs: { 'seen:x': 20 } })
  assert.deepEqual(mergeStores(phone, laptop).seen, [])
})
test('newest rating wins', () => {
  const a = S({ seenRatings: { x: 'ok' }, stamps: { 'rating:x': 1 } }), b = S({ seenRatings: { x: 'liked' }, stamps: { 'rating:x': 2 } })
  assert.equal(mergeStores(a, b).seenRatings.x, 'liked')
})
test('history entries are combined and feedback beats none', () => {
  const a = S({ history: [{ id: 'x', at: 1, status: 'picked', feedback: null }] })
  const b = S({ history: [{ id: 'x', at: 1, status: 'picked', feedback: 'liked' }, { id: 'y', at: 2, status: 'shown', feedback: null }] })
  const h = mergeStores(a, b).history
  assert.equal(h.length, 2); assert.equal(h[0].feedback, 'liked')
})
test('newer settings win', () => {
  const a = S({ settings: { theme: 'dark' }, stamps: { settings: 9 } }), b = S({ settings: { theme: 'light' }, stamps: { settings: 3 } })
  assert.equal(mergeStores(a, b).settings.theme, 'dark')
})
test('old stores without stamps merge without losing anything', () => {
  const m = mergeStores(S({ seen: ['a'], watchlist: [{ id: 'w', at: 1 }] }), S({ seen: ['b'] }))
  assert.deepEqual([...m.seen].sort(), ['a', 'b']); assert.equal(m.watchlist.length, 1)
})
test('first sign-in with no account yet keeps the device data', () => {
  const s = adoptOnSignIn(S({ seen: ['a'] }), null, 'u1')
  assert.deepEqual(s.seen, ['a']); assert.equal(s.owner, 'u1')
})
test("someone else's device data is not merged into a new account", () => {
  const s = adoptOnSignIn(S({ seen: ['a'], owner: 'u1' }), S({ seen: ['b'] }), 'u2')
  assert.deepEqual(s.seen, ['b']); assert.equal(s.owner, 'u2')
})
test('pruneStore drops old tombs and caps history', () => {
  const now = 200 * 864e5
  const s = pruneStore(S({ tombs: { 'seen:old': 1, 'seen:new': now - 864e5 }, history: Array.from({ length: 1200 }, (_, i) => ({ id: 'h', at: i, status: 'shown' })) }), now)
  assert.deepEqual(Object.keys(s.tombs), ['seen:new']); assert.equal(s.history.length, 1000)
})
```
  Add to `store.test.js` (older backups): `assert.deepEqual(s.stamps, {})`, `assert.deepEqual(s.tombs, {})` and `assert.equal(s.owner, null)`.

- [ ] **Step 2: Run** `cd web && npm test`. Expected: FAIL (`merge.js` is missing).

- [ ] **Step 3: Implement** `merge.js` (the four exports above) and add the store fields to `store.js`. `normalize` must accept non-object `stamps` or `tombs` and replace them with `{}`.

- [ ] **Step 4: Run** `npm test`. Expected: all pass.

### Task 2: Record changes in `update()`, plus the Firestore rules

**Files:**
- Modify: `web/src/App.jsx` (`update`, around line 66)
- Create: `firestore.rules` (repo root, exact text from the spec)

**Interfaces:**
- Consumes: `stampChanges` from Task 1.
- Produces: every `update(fn)` call now returns a store with current stamps and tombs.

- [ ] **Step 1: Change `update`** to `setStore((s) => stampChanges(s, fn(structuredClone(s)), Date.now()))`.
- [ ] **Step 2: Create `firestore.rules`** with the spec's rules verbatim.
- [ ] **Step 3: Verify.** `npm test` and `npm run build` pass. Then in `npm run dev`, mark a title seen, run `JSON.parse(localStorage['mealtime-picks:v1']).stamps` in the browser console, and it shows `seen:<id>`.

### Task 3: Firebase wiring (`sync.js`) and config

**Files:**
- Create: `web/src/lib/firebase-config.js`, `web/src/lib/sync.js`
- Modify: `web/package.json` (add `firebase` dependency via `npm install firebase`)

**Interfaces:**
- `firebase-config.js`: `export const firebaseConfig = null`, replaced by the owner's config object once they share it. While it's `null`, `syncAvailable()` returns `false` and the UI hides the account section.
- `sync.js` (every Firebase import is a dynamic `import()` inside these functions):
  - `syncAvailable() → boolean`.
  - `watchAuth(cb: (user: { uid, name, photo } | null) => void) → Promise<() => void>`: initialises the app and Firestore once, with `initializeFirestore(app, { localCache: persistentLocalCache() })`.
  - `signIn() → Promise<void>`: uses `signInWithPopup(auth, new GoogleAuthProvider())`.
  - `signOut() → Promise<void>`.
  - `startSync(uid, { getLocal: () => Store, setLocal: (s: Store) => void, onStatus: (s: 'synced' | 'pending' | 'offline' | 'error') => void }) → Promise<() => void>`. In order:
    1. `getDoc(users/uid)`.
    2. `setLocal(pruneStore(adoptOnSignIn(getLocal(), data ?? null, uid), Date.now()))`.
    3. Write the result back.
    4. `onSnapshot`: for snapshots without `hasPendingWrites`, `setLocal(mergeStores(getLocal(), remote))`.
    5. Return a stop function.
  - `pushLocal(uid, store) → void`: debounced 1000 ms. It writes `JSON.parse(JSON.stringify(pruneStore(mergeStores(latestRemote ?? store, store), Date.now())))`, where `latestRemote` is the last snapshot seen.
  - **Status:** report `navigator.onLine === false` as `'offline'`; set `'pending'` while a write is in flight, and `'error'` on failure (retry on the next change).

- [ ] **Step 1: Run** `cd web && npm install firebase`.
- [ ] **Step 2: Implement** `firebase-config.js` and `sync.js` as above. There are no unit tests for this file, since it's thin Firebase glue; its logic is in Task 1.
- [ ] **Step 3: Verify.**
  - `npm test` and `npm run build` pass.
  - Run `grep -l "firebase" dist/assets/index-*.js`. Expected: **no match**, meaning Firebase is only in a separate lazy chunk. `ls dist/assets` shows an extra chunk.

### Task 4: Account UI and app wiring

**Files:**
- Modify: `web/src/App.jsx`, `web/src/screens/Setup.jsx`, `web/src/screens/Pick.jsx`

**Interfaces:**
- Consumes: Task 3's `syncAvailable`, `watchAuth`, `signIn`, `signOut`, `startSync`, `pushLocal`. Task 1's `emptyStore`.
- **App state:** `user` (or `null`) and `syncStatus`. Pass `account = { user, status, signIn, signOut, clearDevice }` to Setup and Pick.
  - **Auth:** when `syncAvailable()`, an effect calls `watchAuth`. When `user` is set, it calls `startSync`; cleanup stops it.
  - **Local changes:** the existing `save(store)` effect also calls `pushLocal(user.uid, store)` when signed in.
  - **`setLocal`:** must not echo back. Track a ref to the last store received from remote, and skip `pushLocal` when `store === thatRef`.
  - **`clearDevice()`:** sets the store to `emptyStore()` (onboarded kept `false`) after sign-out.

- [ ] **Step 1: Add "Your account" to Setup**, as the first section, rendered only when `syncAvailable()`.
  - **Signed out:** a **Sign in with Google** primary button, plus the line *"Keeps your seen list, ratings and watchlist the same on all your devices."*
  - **Signed in:** a round avatar (`user.photo`, or an initial), the name, and status text: `synced` → "Synced", `pending` → "Syncing…", `offline` → "Offline, will sync", `error` → "Couldn't sync, retrying". Plus a **Sign out** outline button.
  - **After sign-out:** a note, *"This device keeps a copy."*, and a **Clear this device** text button.
  - **Errors:** if the pop-up is blocked, show *"Pop-up blocked. Allow pop-ups, or open the app in your browser to sign in."*
- [ ] **Step 2: Pick.jsx.** When signed in, the Setup `IconButton` shows the user's photo, as a 28 px round `img` filling the tile, in place of the sliders icon.
- [ ] **Step 3: Verify.**
  - `npm test` and `npm run build` pass. With `firebaseConfig = null`, Setup shows no account section and the app behaves exactly as before.
  - **Manual, once the owner's config is in:** sign in on two browsers; mark, un-mark and rate on one and watch the other update; take one offline, change things, reconnect and check they converge; sign out, sign in as a second Google account on the same browser, and check it shows that account's data, not the first person's.
  - **Manual on an iPhone home-screen install:** record whether the pop-up works.
