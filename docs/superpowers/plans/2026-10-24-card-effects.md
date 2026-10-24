# Card Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Project rule:** never `git commit`, branch, merge or push. Leave changes uncommitted. This plan has no commit steps.

**Goal:** Each pick card on the Results screen plays one themed entrance moment, chosen by genre and description words, when it comes on screen.

**Architecture:**
- **Choosing:** a pure chooser (`lib/fx.js`) decides each card's effect.
- **Drawing:** a DOM player (`lib/fxPlayer.js`) draws and cleans up an effect inside a card element.
- **Scheduling:** a hook (`lib/useCardFx.js`) watches cards with an IntersectionObserver and plays them 0.8 s apart. It also handles the glint for repeat titles, tap-to-replay and reduced motion.
- **Styles:** the effects' CSS lives in `fx.css`, ported from the approved demo with every duration divided by 0.55.

**Tech Stack:** React 19, Tailwind v4 (plain CSS for the effects), `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-24-card-effects-design.md`.
**Reference implementation** (throwaway): `.superpowers/brainstorm/1386-1792819782/content/picks-experience.html` and `themed-cards-v26.html`. Port the effect CSS and drawing helpers from these.

## Global Constraints

- **Speed:** 0.55×. Every animation duration and delay copied from the demo is divided by 0.55 and rounded to 10 ms. No `playbackRate` tricks.
- **Visibility:** a card plays once at least 60% of it is visible. Queued cards start **800 ms** apart. Each card plays once per round.
- **Repeats:** a title shown in an earlier round gets a 0.6 s glint instead.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, nothing plays, not even the glint.
- **No gore:** no blood effects anywhere.
- **Cleanup:** every injected node is removed when its effect ends, and on unmount.
- **Scope:** Results screen only.
- **No commits.**

## Review Focus

1. **Fast taps:** the person taps "What else is cooking?" while effects are mid-play. Pending timers must not inject into new cards, and old nodes must not leak. *(Task 3: the stop function cancels the queue; Task 2: the player's cancel removes nodes.)*
2. **Slice with long titles or wrapped text:** the cut line must sit on the seam at any card height or width, including laptop's full-width poster layout. *(Task 2 manual check with a long title, at both widths.)*
3. **"Seen it" or "Later" replaces a card mid-effect.** The new card plays and the old one's nodes are gone. *(Task 3: React keys cause unmount; the cleanup runs.)*
4. **Light theme:** the glints, cut line and eyecatch stripe stay visible on the paper background. *(Task 2 CSS: `[data-theme=light]` and prefers-light overrides add a dark glow.)*
5. **Missing data:** a card with no poster, no genres or no overview still gets an effect (plain, or by genre) and never crashes. *(Task 1 test: an empty item gives `plain`.)*

---

### Task 1: Effect chooser (`lib/fx.js`)

**Files:**
- Create: `web/src/lib/fx.js`, `web/src/lib/fx.test.js`

**Interfaces:**
- **Produces:**
  - `effectFor(item) → { group, weapon }`.
    - `group` is one of: horror, anime, war, crime, mystery, thriller, scifi, fantasy, adventure, action, animation, standup, comedy, romance, music, history, docu, family, sports, drama, western, live, plain.
    - `weapon` is `'slice'`, `'guns'` or `null`.
  - `variantFor(group, rng = Math.random) → string`. For horror, one of `'lightsout' | 'walkpast' | 'badtape'`. For anime, one of `'manga' | 'eyecatch' | 'kira'`. For every other group, the group itself.
  - `shownBefore(history, id, session) → boolean`: true when the id has a `status: 'shown'` entry in a session other than `session`.
- **Rules:** the spec's priority table, the regexes and the stand-up/YouTube condition, exactly as written in the spec.

- [ ] **Step 1: Write failing tests** (`fx.test.js`):
```js
const it = (o) => ({ kind: 'movie', genres: [], moods: {}, overview: '', ...o })
test('genre priority', () => {
  assert.equal(effectFor(it({ genres: ['Comedy', 'Horror'] })).group, 'horror')
  assert.equal(effectFor(it({ genres: ['Action'], moods: { anime: 1 } })).group, 'anime')
  assert.equal(effectFor(it({ genres: ['Drama', 'Crime'] })).group, 'crime')
  assert.equal(effectFor(it({ genres: ['Sci-Fi & Fantasy'] })).group, 'scifi')
  assert.equal(effectFor(it({ genres: ['Reality'] })).group, 'live')
})
test('stand-up only for YouTube; sports and anime by mood', () => {
  assert.equal(effectFor(it({ kind: 'youtube', moods: { standup: .8 } })).group, 'standup')
  assert.equal(effectFor(it({ moods: { standup: .8 }, genres: ['Comedy'] })).group, 'comedy')
  assert.equal(effectFor(it({ kind: 'youtube', moods: { sports: .9 } })).group, 'sports')
  assert.equal(effectFor(it({ moods: { anime: .4 }, genres: ['Drama'] })).group, 'drama')
})
test('weapons: sword beats gun, whole words only', () => {
  assert.equal(effectFor(it({ overview: 'A samurai is shot at dawn' })).weapon, 'slice')
  assert.equal(effectFor(it({ overview: 'An assassin is shot by her boss' })).weapon, 'guns')
  assert.equal(effectFor(it({ overview: "Assassin's Creed" })).weapon, 'guns')
  assert.equal(effectFor(it({ overview: 'He fires a shotgun' })).weapon, null)
})
test('empty or odd items fall back to plain', () => {
  assert.deepEqual(effectFor({}), { group: 'plain', weapon: null })
  assert.equal(effectFor(it({ genres: ['Soap'] })).group, 'plain')
})
test('variants', () => {
  assert.equal(variantFor('horror', () => 0), 'lightsout')
  assert.equal(variantFor('anime', () => .99), 'kira')
  assert.equal(variantFor('war'), 'war')
})
test('shownBefore ignores the current round', () => {
  const h = [{ id: 'a', status: 'shown', session: 's1' }, { id: 'b', status: 'shown', session: 's2' }]
  assert.equal(shownBefore(h, 'a', 's2'), true)
  assert.equal(shownBefore(h, 'b', 's2'), false)
  assert.equal(shownBefore(h, 'c', 's2'), false)
})
```
- [ ] **Step 2: Run** `cd web && npm test`. Expected: FAIL (`fx.js` is missing).
- [ ] **Step 3: Implement** `fx.js` per the Interfaces block.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.

### Task 2: Effect styles and player (`fx.css`, `lib/fxPlayer.js`)

**Files:**
- Create: `web/src/fx.css` (imported from `main.jsx`), `web/src/lib/fxPlayer.js`

**Interfaces:**
- **Card markup contract**, which Task 3 provides:
  - `el` is the card `<article>`, with class `fxcard`.
  - It holds one content wrapper `.fx-body` (everything the card shows) and the poster `img.fx-poster`.
- **Produces:**
  - `playEffect(el, { group, variant, weapon }) → () => void` (cancel). It:
    1. clears any previous run;
    2. removes the card's `serve` class, so its entrance animation can't restart;
    3. sets `--px` and `--py`: the poster's centre relative to the card, in px, measured with `getBoundingClientRect`;
    4. adds class `fx-<variant>`, plus `fx-slice` if `weapon === 'slice'`;
    5. injects the variant's markup (bullet holes, tape, curtains, runes and so on);
    6. schedules its own cleanup.
  - The cancel function removes everything immediately.
  - `playGlint(el, group) → () => void`: a 0.6 s edge glint in the group's colour, from the demo's `GLINT` table.
  - `FX_MS: Record<variant, number>`: total duration per variant, used for cleanup.
- **Porting rules:**
  - **Source:** port each effect's CSS and drawing helpers (`holeSvg`/`holes`, `slice`, `EXTRA`, `kicks`) from the reference files, renaming the card classes `.<theme>` → `.fx-<variant>`, `.row` → `.fx-body` and `.card img` → `.fx-poster`.
  - **Poster-centred effects** (shock, runes, manga halftone) use `left: var(--px); top: var(--py)` instead of the demo's fixed 55 px / 76 px. The halftone is sized to the poster's measured width and height (`--pw`, `--ph`).
  - **The slice** follows the spec's "Traps": copies use `position: absolute; inset: 0` with the card's padding (read with `getComputedStyle`), and the SVG gets `width: 100%; height: 100%`.
  - **Bullet holes** go only in the area right of the poster on phones and below it on laptops. They use `--px`/`--pw` to stay clear of the poster.
  - **Light theme:** under `:root[data-theme="light"]` and `@media (prefers-color-scheme: light) :root:not([data-theme="dark"])`, give the white glints, cut line and eyecatch stripe a `drop-shadow(0 0 2px rgba(0,0,0,.6))`.
  - **Reduced motion:** add `@media (prefers-reduced-motion: reduce) { .fxcard * { animation: none !important } }` as a backstop. Task 3 also stops effects from playing at all.

- [ ] **Step 1: Write `fx.css`.** Durations are already divided by 0.55. Every variant from the spec's table is present: lightsout, walkpast, badtape, manga, eyecatch, kira, war, crime, mystery, thriller, scifi, fantasy, adventure, action (impact), animation, comedy, standup, romance, music, history, docu, family, sports, drama, western, live, plain, slice, bullet holes, and the glint.
- [ ] **Step 2: Write `fxPlayer.js`** per the Interfaces block.
- [ ] **Step 3: Verify.**
  - `npm test` and `npm run build` pass.
  - `rg -n "blood|drip" web/src` finds no matches.

### Task 3: Scheduling and card wiring (`lib/useCardFx.js`, `Results.jsx`)

**Files:**
- Create: `web/src/lib/useCardFx.js`
- Modify: `web/src/screens/Results.jsx`

**Interfaces:**
- **Consumes:** Task 1's `effectFor`, `variantFor` and `shownBefore`; Task 2's `playEffect` and `playGlint`.
- **Produces:**
  - `useCardFx({ picks, session, history }) → { ref(key) → (el) => void, replay(key) }`.
  - `ref(key)` registers or unregisters each card element.
  - **When a registered card is ≥60% visible and hasn't played this round:** it's queued in DOM order. The queue starts the next card 800 ms after the previous one started.
  - **Repeat titles:** a card whose main item `shownBefore(history, id, session)` gets `playGlint` instead.
  - **New rounds:** a new `session` or a changed set of pick keys resets "played this round" for new keys only. A replacement card plays; the kept ones don't replay.
  - **Reduced motion:** when `matchMedia('(prefers-reduced-motion: reduce)')` matches, it does nothing.
  - **`replay(key)`:** plays the full effect immediately, with a new random variant, outside the queue.
  - **Unmount:** the observer disconnects, the queue timers are cleared and every cancel function is called.

- [ ] **Step 1: Wire up `Results.jsx`.**
  - Each `<article>` gets `fxcard` in its class list and `ref={fx.ref(p.key)}`.
  - Wrap everything after the glow and veil layers in `<div className="fx-body flex flex-col gap-3">`.
  - Pass `className="fx-poster"` to `Poster` (add a `className` prop to `Poster` in `ui.jsx`, applied to the `img` and the placeholder `div`).
  - Tapping the poster calls `fx.replay(p.key)`. Wrap the `Poster` in a `button` with `aria-label="Replay the card's effect"`, styled as a plain block.
- [ ] **Step 2: Implement `useCardFx.js`** per the Interfaces block.
- [ ] **Step 3: Verify.**
  - `npm test` and `npm run build` pass.
  - **Headless probe**, as done for the demo: run `npm run dev` and load `/#/results` after a pick. The `serve` → `fx-*` classes appear on all three cards, with start times about 800 ms apart and no console errors.
  - **Manual, 360 px and laptop width, both themes:**
    - every variant (use catalog titles, or temporarily force a variant in the console);
    - the slice line on the seam;
    - tap to replay;
    - "What else is cooking?" mid-effect leaves no stray nodes (DevTools → the card has no extra children afterwards);
    - reduced motion means nothing plays.
