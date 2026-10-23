# Cinema Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the Mealtime Picks PWA as a cinematic app with a drifting TMDB poster wall, in light and dark themes that follow the phone or a Setup override.

**Architecture:**
- **Theme:** both palettes are CSS variables, keyed on `data-theme` on `<html>`. Tailwind v4 utilities already read `var(--color-*)`, so redefining tokens per theme re-skins every screen. A tiny inline script in `index.html` applies the saved theme before first paint, and `lib/theme.js` keeps it in sync afterwards.
- **Poster wall:** a pure selector (`lib/wall.js`) chooses which posters to show, and a decorative component (`PosterWall.jsx`) draws them.
- **Screens:** only class names change. No logic or data changes.

**Tech Stack:** React 19, Tailwind CSS v4 (`@theme` tokens), Vite 8 + vite-plugin-pwa, `node --test` for unit tests.

**Spec:** `docs/superpowers/specs/2026-10-23-cinema-redesign-design.md`

## Global Constraints

- Dark palette: ground `#0A0A0E`, panels `#15151C` / `#1D1D26`, hairlines `#2A2A36`, text `#F3F1EC`, secondary `#B7B3AA`, muted `#85818A`, gold `#F2B544`, ink-on-gold `#1A1205`.
- Light palette: ground `#F4EFE6`, panels `#FFFFFF` / `#FBF7F0`, hairlines `#E2D9CA`, text `#1B1712`, secondary `#4E463C`, muted `#6E655A`, accent amber `#A8650A`. Selected chips and the "Open" button are near-black `#1B1712` with `#F4EFE6` text. The main CTA is a near-black gradient with `#F7C25C` text.
- Fonts: **Bebas Neue** (display) and **Inter** (body) from Google Fonts. They replace Bricolage Grotesque and DM Sans.
- Grain overlay: SVG fractal noise, about 9% / overlay (dark) and about 6% / multiply (light), `pointer-events: none`.
- `settings.theme` is `'system' | 'light' | 'dark'`, default `'system'`.
- Body text contrast at least 4.5:1, including over blurred posters.
- The drift stops completely under `prefers-reduced-motion: reduce`.
- No copyrighted art in the repo. Images come from `image.tmdb.org` at runtime only, and TMDB is credited.
- Layout holds at 360 px width. The app stays capped at 480 px.
- No changes to picking logic, catalog data, or the Go fetcher.

## Review Focus

1. **No catalog yet:** first run offline, or `catalog.json` failed to load. The wall shows tinted placeholder tiles, and every control still works. *(Task 3 test: `wallPosters` on an empty catalog returns `[]`; component renders placeholders.)*
2. **Broken or blocked storage:** a corrupt value or blocked `localStorage` when the inline theme script runs. The page loads following the phone's setting, with no script error. *(Task 1 test: `resolveTheme` with garbage input.)*
3. **Small catalog:** fewer posters than the wall needs (the sample catalog, or a narrow week). The wall still looks full by repeating posters, never blank strips. *(Task 3 test: `wallRows` with 3 posters still fills every row.)*
4. **Override disagrees with the phone:** the theme is overridden to Light while the phone is dark, or the reverse. The status-bar colour follows the override, not the phone. *(Task 1 test: `themeColor` returns the colour of the resolved theme.)*
5. **Long titles over bright posters:** long names ("The Lord of the Rings: The Return of the King") or a long description over a bright poster at 360 px. Text stays readable and the buttons never overflow. *(Task 4 manual check, both themes.)*

---

### Task 1: Theme tokens, fonts and theme switching

**Files:**
- Create: `web/src/lib/theme.js`, `web/src/lib/theme.test.js`
- Modify: `web/src/index.css` (whole token block), `web/index.html` (fonts, theme-color metas, inline script), `web/vite.config.js` (manifest colours), `web/src/lib/store.js` (`emptyStore().settings.theme`), `web/src/lib/store.test.js`, `web/src/App.jsx` (apply theme on change)

**Interfaces:**
- Produces:
  - `resolveTheme(setting: unknown, prefersDark: boolean) → 'light' | 'dark'`. Anything other than `'light'` or `'dark'` counts as system.
  - `themeColor(resolved: 'light' | 'dark') → string`: `'#0A0A0E'` for dark, `'#F4EFE6'` for light.
  - `applyTheme(setting: string) → () => void`: sets `document.documentElement.dataset.theme` (removing it for system), sets the `content` of **both** `<meta name="theme-color">` tags to `themeColor(resolved)` so an override beats their `media` queries, and listens to `matchMedia('(prefers-color-scheme: dark)')` while the setting is `'system'`. It returns a cleanup function.
- Produces these Tailwind tokens for both themes, used by every later task:
  - **Surfaces:** `ground`, `card`, `card-2`, `line`, `hair`, `chip`.
  - **Text:** `ink` (main text), `soft`, `muted`.
  - **Accents:** `gold` (brand, ratings, "why" lines), `sel` and `sel-ink` (selected chip bg and text), `primary` and `primary-ink` (the Open/Done button), `cta-from`, `cta-to` and `cta-ink` (the main button gradient and its text).
  - **Kept:** `accent`, `good`, `good-bg`, `star` and `star-bg`, remapped to fit both themes.
  - **Fonts:** `font-display` = Bebas Neue, `font-sans` = Inter.

- [ ] **Step 1: Write failing tests**

`theme.test.js`:
```js
test('resolveTheme: explicit choice wins, anything else follows the phone', () => {
  assert.equal(resolveTheme('light', true), 'light')
  assert.equal(resolveTheme('dark', false), 'dark')
  assert.equal(resolveTheme('system', true), 'dark')
  assert.equal(resolveTheme(undefined, false), 'light')
  assert.equal(resolveTheme('{garbage', true), 'dark')
})
test('themeColor follows the resolved theme, not the phone', () => {
  assert.equal(themeColor('dark'), '#0A0A0E')
  assert.equal(themeColor('light'), '#F4EFE6')
})
```
`store.test.js`: in `older backups … still load`, add `assert.equal(s.settings.theme, 'system')`.

- [ ] **Step 2: Run** `cd web && npm test`. Expected: FAIL (`theme.js` is missing, and `settings.theme` is undefined).

- [ ] **Step 3: Implement**
  - **`theme.js`:** the three functions above. `applyTheme` must not throw when `matchMedia` is missing.
  - **`store.js`:** add `theme: 'system'` to `emptyStore().settings`. `normalize` already merges settings.
  - **`index.css`:**
    - In `@theme`, define all tokens with the **light** values and the fonts.
    - Redefine them under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` and again under `:root[data-theme="dark"] { … }`, using the Global Constraints values.
    - Add `color-scheme: light dark` to `:root`, and set `body { background: var(--color-ground) }`.
  - **`index.html`:**
    - Swap the Google Fonts link to `family=Bebas+Neue&family=Inter:wght@400;500;600;700`.
    - Replace the single `theme-color` meta with two: `media="(prefers-color-scheme: light)"` `#F4EFE6` and `media="(prefers-color-scheme: dark)"` `#0A0A0E`.
    - Add an inline `<script>` in `<head>` that, inside `try/catch`, reads `localStorage['mealtime-picks:v1']`, parses `settings.theme`, and sets `document.documentElement.dataset.theme` only for `'light'` or `'dark'`.
  - **`App.jsx`:** add `useEffect(() => applyTheme(store.settings.theme), [store.settings.theme])`.
  - **`vite.config.js`:** set manifest `background_color` and `theme_color` to `#0A0A0E`.

- [ ] **Step 4: Run** `npm test` (expect all pass) and `npm run build` (expect `✓ built`).

- [ ] **Step 5: Commit** `feat(web): light and dark cinema theme tokens with system/override switching`

### Task 2: Move white-on-white usages to purpose tokens

**Files:**
- Modify: `web/src/components/ui.jsx`, `web/src/screens/{Pick,Results,SeenGrid,Setup,Inbox,Watchlist}.jsx`

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces: `Chip` uses `bg-sel text-sel-ink border-sel` when `on`. Every solid dark button uses `bg-primary text-primary-ink`.

- [ ] **Step 1: Run the check that should fail.** `rg -n "bg-ink|border-ink|text-white" web/src` lists the current uses (about 15). Each one is a target.

- [ ] **Step 2: Replace each use.**
  - **Selected states** (Chip, SeenGrid tile and rating buttons): use `sel` / `sel-ink`.
  - **Solid action buttons** (Open, Done, Setup Done, SeenGrid Done): use `primary` / `primary-ink`.
  - **The main "Pick 3 for us" button and the watchlist count badge:** use `bg-linear-to-b from-cta-from to-cta-to text-cta-ink` (Tailwind v4 name).
  - **Focus outline** in `index.css`: use `--color-gold`.

- [ ] **Step 3: Verify.**
  - `rg -n "bg-ink|border-ink|text-white" web/src`: expect no matches.
  - `npm test` and `npm run build`: expect them to pass.

- [ ] **Step 4: Commit** `refactor(web): purpose-named colour tokens so both themes stay readable`

### Task 3: Poster wall on the home screen

**Files:**
- Create: `web/src/lib/wall.js`, `web/src/lib/wall.test.js`, `web/src/components/PosterWall.jsx`
- Modify: `web/src/screens/Pick.jsx`, `web/src/index.css` (drift keyframes and reduced-motion rule)

**Interfaces:**
- Consumes: the `store` shape: `history[].feedback`, `seenRatings`, `saved[].ids`, `watchlist[].id`. Catalog items: `id`, `kind`, `poster`, `popular`, `q`.
- Produces:
  - `wallPosters(items: object[], store: object, limit = 24) → string[]`: poster URLs with `/w342/` swapped for `/w185/`.
    - **Order:** loved (history `liked`, `seenRatings` `liked`, saved Instagram ids), then the watchlist, then `popular` titles sorted by `q` descending, then the rest by `q`.
    - **Rules:** no duplicates, YouTube skipped, titles without a poster skipped.
  - `wallRows(posters: string[], rows = 3, perRow = 8) → string[][]`: splits the posters into rows, cycling the list when it's too short. Returns `[]` when there are no posters.
  - `<PosterWall posters={string[]} />`: `aria-hidden`, `alt=""`, `loading="lazy"`. Each row's images are rendered twice for a seamless loop. If `posters` is empty, it shows 24 tinted placeholder tiles, using the existing `tints` in `ui.jsx` (export them).

- [ ] **Step 1: Write failing tests** in `wall.test.js`:
```js
test('loved first, then watchlist, then popular by quality; no dupes, no YouTube', () => {
  const items = [
    it('pop-lo', { popular: true, q: 0.2 }), it('pop-hi', { popular: true, q: 0.9 }),
    it('loved'), it('saved'), it('yt', { kind: 'youtube' }), it('noposter', { poster: '' }), it('rest', { q: 0.5 }),
  ]
  const store = { history: [{ id: 'loved', feedback: 'liked' }], seenRatings: {}, saved: [], watchlist: [{ id: 'saved' }, { id: 'loved' }] }
  assert.deepEqual(wallPosters(items, store).map(idOf), ['loved', 'saved', 'pop-hi', 'pop-lo', 'rest'])
})
test('uses the small poster size', () => assert.match(wallPosters([it('a')], emptyish)[0], /\/w185\//))
test('respects the limit', () => assert.equal(wallPosters(many(40), emptyish, 24).length, 24))
test('empty catalog gives no posters and no rows', () => {
  assert.deepEqual(wallPosters([], emptyish), [])
  assert.deepEqual(wallRows([]), [])
})
test('a short list still fills every row', () => {
  const rows = wallRows(['a', 'b', 'c'], 3, 8)
  assert.equal(rows.length, 3)
  for (const r of rows) assert.equal(r.length, 8)
})
```
Helpers: `it(id, o)` builds `{ id, kind: 'movie', poster: 'https://image.tmdb.org/t/p/w342/' + id + '.jpg', q: 0.5, ...o }`. `idOf` pulls the id back out of the URL. `emptyish` is `{ history: [], seenRatings: {}, saved: [], watchlist: [] }`. `many(n)` returns n items.

- [ ] **Step 2: Run** `npm test`. Expected: FAIL (`wall.js` is missing).

- [ ] **Step 3: Implement** `wall.js`, `PosterWall.jsx` and the `index.css` drift rules.
  - **Wall layout:** absolutely positioned, rotated −9°, three rows with a 10 px gap, posters 96×144 with 8 px radius.
  - **Drift:** `@keyframes drift { to { transform: translateX(-50%) } }`. Row durations are 60s, 75s reversed, and 90s. Under `prefers-reduced-motion: reduce`, set `animation: none`.
  - **Fade:** an overlay with a radial and vertical gradient into `var(--color-ground)`.

- [ ] **Step 4: Restyle `Pick.jsx`** to match the demo.
  - **Behind the content:** `<PosterWall posters={wallPosters(items, store)} />` sits behind the content, with `wallPosters` memoised on the catalog and store.
  - **Header:** brand "MEALTIME PICKS" in `font-display text-gold tracking-[0.14em]`, and frosted icon tiles (`bg-card/60 backdrop-blur`).
  - **Headline:** about 200 px down, the kicker "Tonight's showing", then "What are we watching?" in `font-display text-[52px] leading-[0.92]`.
  - **Section labels:** uppercase `text-muted`.
  - **Main button:** the gradient CTA with a soft shadow.

- [ ] **Step 5: Run** `npm test` and `npm run build`, expecting both to pass. Then run `npm run dev` at 360 px: the wall drifts, the controls are clickable, and with the network offline before the catalog loads the placeholders show.

- [ ] **Step 6: Commit** `feat(web): drifting poster wall on the home screen`

### Task 4: Cinematic pick cards

**Files:**
- Modify: `web/src/screens/Results.jsx`, `web/src/components/Details.jsx`, `web/src/components/ui.jsx` (`Poster` gains a `size` prop)

**Interfaces:**
- Consumes: Task 1 tokens, and `Poster`, `DetailBadges` and `About`.
- Produces: `Poster({ item, count = 1, size = 'md' })`. `'md'` is the current 78×104 and `'lg'` is 92×138 with `shadow-xl`.

- [ ] **Step 1: Restyle each card** (`Results.jsx`).
  - **Background:** a blurred copy of `main.poster`, absolutely positioned at `-inset-5`, with `blur-[22px] scale-115` and `brightness-[.45]` (dark) or `opacity-55 brightness-110` (light).
  - **Gradient:** between that background and the content, `from-ground/10 to-ground/75` (dark) or `to-white/90` (light).
  - **Fallback:** combos and cards without a poster keep the plain `bg-card`.
  - **Poster:** `size="lg"`.
  - **Screen title:** "Here are 3" in `font-display`.
  - **"Why" line:** `text-gold`.
  - **Buttons:** "Open" is `bg-primary text-primary-ink`. "Seen it", "Later" and the rating buttons are `bg-card/50 border-line backdrop-blur`.
  - **Credit:** "Title data and images from TMDB", centred at the bottom in `text-xs text-muted`.

- [ ] **Step 2: In `Details.jsx`**, point the rating badge at `text-gold` with a gold-tinted background (`bg-gold/15`), replacing `star` / `star-bg`.

- [ ] **Step 3: Verify.**
  - `npm test` and `npm run build` pass.
  - Manual check in `npm run dev` at 360 px, both themes: a long title over a bright poster (find one in the catalog, such as *The Lord of the Rings: The Return of the King*) keeps readable text and the three buttons on one row. Then check a dark poster.
  - Check description text against its darkest and lightest backdrop with the browser's contrast checker: at least 4.5:1.

- [ ] **Step 4: Commit** `feat(web): cinematic pick cards lit by their poster`

### Task 5: Remaining screens, Theme control and grain

**Files:**
- Modify: `web/src/screens/{Setup,Watchlist,SeenGrid,Inbox}.jsx`, `web/src/App.jsx` (grain wrapper), `web/src/index.css` (`.grain` overlay rules per theme)

**Interfaces:**
- Consumes: Task 1 tokens and `settings.theme`. Task 4's `Poster` sizes.

- [ ] **Step 1: Add the Theme control to Setup.** Put a `Section title="Theme"` with three `Chip`s (System / Light / Dark) right after "Family-safe only". Each sets `settings.theme`.

- [ ] **Step 2: Restyle the other screens.**
  - Screen titles use `font-display`, sized up about 4 px to suit Bebas Neue.
  - Panels use `bg-card border-hair`.
  - Watchlist entries use `Poster size="lg"` and the same button styles as Task 4.

- [ ] **Step 3: Add the grain.** The `App` root div gets `relative grain`. In `index.css`, `.grain::after` is a fixed-position SVG-noise layer at 9% / overlay, and 6% / multiply when the light theme is active (both selectors from Task 1). It has `pointer-events: none` and `z-index` above content.

- [ ] **Step 4: Verify.**
  - `npm test` and `npm run build` pass.
  - Manual check in `npm run dev` at 360 px, both themes, every screen.
  - In Setup, switch System → Light → Dark: the theme and the status-bar colour change instantly.
  - With System selected, toggle the OS dark mode: the app follows.
  - Reload with Dark chosen on a light phone: there's no light flash.

- [ ] **Step 5: Commit** `feat(web): cinema styling on every screen, theme switch and film grain`
