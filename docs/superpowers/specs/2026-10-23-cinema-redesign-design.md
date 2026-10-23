# Cinema redesign

Approved demos: `.superpowers/brainstorm/1226-1792757854/content/cinema-demo.html` (dark) and `cinema-light.html` (dark and light side by side). Both are local only and gitignored. Where this document and the demos disagree, this document wins.

## Why

The app works but looks generic: a light grey utility UI. The owner wants it to feel like it was made by someone who loves movies and series. They first pictured the most popular characters (Game of Thrones, Breaking Bad, One Piece, Naruto, Death Note) together in one cinematic frame. Hand-made character art is copyrighted and the app is public on GitHub Pages, so the frame is built from real **TMDB posters** instead. TMDB's terms allow that with credit, and the app already credits TMDB.

## Goals

- Opening the app feels like walking into a cinema lobby: a drifting wall of real posters behind the headline.
- Every screen comes in a **dark** and a **light** cinematic version. The owner asked for both.
- Pick cards make each title look like a film, not a list row.

## Non-goals

- No changes to picking logic, data, storage or the weekly fetch.
- No new screens or features. The "Anime" mood chip in the demo is a preview of the next project and is **not** part of this one.

## Anti-goals

- Copyrighted art bundled into the repo. Every image comes from TMDB's image server at runtime, as today.
- Slower or heavier first load. The poster wall must not block the controls, must not push the page's own code much past its current size, and must work offline from cache.
- Motion that makes anyone queasy. The drift is slow and stops entirely under `prefers-reduced-motion`.
- Worse readability. Body text stays at least 4.5:1 contrast against its background, including over blurred posters.

## The look (as approved in the demo)

**Dark palette.**
- **Surfaces:** near-black ground `#0A0A0E`, panels `#15151C` / `#1D1D26`, hairlines `#2A2A36`.
- **Text:** `#F3F1EC`, secondary text `#B7B3AA`, muted `#85818A`.
- **Accent:** gold `#F2B544`, with dark ink `#1A1205` on gold. The gold is the "marquee" colour: selected chips, the main button, ratings, "why this pick" lines and the brand.

**Light palette.**
- **Surfaces:** warm paper ground `#F4EFE6`, panels `#FFFFFF` / `#FBF7F0`, hairlines `#E2D9CA`.
- **Text:** `#1B1712`, secondary text `#4E463C`, muted `#6E655A`.
- **Accent:** deep amber `#A8650A` (gold isn't readable on paper), used for the brand, ratings and "why" lines.
- **Selected states and buttons:** selected chips and the "Open" button are near-black with paper-coloured text. "Pick 3 for us" is a near-black gradient with gold `#F7C25C` text, like a cinema ticket.
- **Posters and texture:** the wall fades into the paper colour, pick-card backgrounds are paler poster tints under a mostly white gradient, and the grain is lighter (about 6%, multiply blend).

**Choosing the theme** *(builder's call, approved with the demos)*.
- **Default:** the app follows the phone's light or dark setting (`prefers-color-scheme`) and changes live if that setting changes.
- **Override:** Setup gets a **Theme: System / Light / Dark** choice, stored as `settings.theme` (`'system'` by default, so older backups load unchanged).
- **How it's applied:** a `data-theme` attribute on `<html>`, with both palettes defined as CSS variables. Apply it before first paint, from a small inline script in `index.html` that reads the saved setting, so the app never flashes the wrong theme.

**Type.** **Bebas Neue** for display (the headline, screen titles, the brand) and **Inter** for everything else, both from Google Fonts. They replace Bricolage Grotesque and DM Sans.

**Texture.** A subtle film-grain overlay over the whole app (SVG noise, about 9% opacity, overlay blend, no pointer events).

## Screens

**Home (`Pick.jsx`)**
- **Poster wall:** three rows of posters, rotated about −9°, drifting sideways at different speeds and directions. The rows are duplicated so the loop is seamless.
- **Fade:** a radial and vertical gradient fades the wall into the ground colour.
- **Headline and brand:** "Tonight's showing" kicker plus "What are we watching?" in Bebas Neue sits over the bottom of the wall, with the brand "MEALTIME PICKS" in gold at top left.
- **Icon buttons:** watchlist (with count), inbox and setup become frosted dark tiles.
- **Choices:** time, mood and who's-watching become dark pills, and the selected one is solid gold.
- **"Last time" feedback card:** adopts the dark panel style.
- **Main button:** "Pick 3 for us" is a gold gradient with a soft gold glow.

**Which posters the wall uses**
- Titles the family loved come first: 👍 on picks, "Loved it" on seen titles, and saved Instagram finds.
- Watchlisted titles are next.
- The rest is filled from catalog titles marked `popular`, then by quality score.
- Only titles with a poster count, YouTube excluded, about 24 in total, without duplicates.
- The wall uses TMDB's smaller `w185` poster size (swap `/w342/` in the URL) to keep it light. The service worker already caches TMDB images.

**Picks (`Results.jsx`)**
- Each card's background is a heavily blurred, darkened copy of its own poster, under a dark gradient so text stays readable.
- The poster grows to about 92×138.
- The rating badge is gold, other badges are translucent white, and the "why" line is gold.
- "Open …" is a solid light button. "Seen it" and "Later" are translucent outlined buttons.
- The "How was it?" rating row and Skip follow the same button styles.
- A small "Title data and images from TMDB" credit sits at the bottom.

**Watchlist, Seen grid, Setup, Inbox:** dark panels, gold for selected and active states, Bebas Neue screen titles, the same button styles. No layout changes.

## Constraints and known traps

- **Shared colour names change meaning between themes.** Colours come from Tailwind tokens in `web/src/index.css` (`ground`, `card`, `ink`, `line`, `chip`, `accent` …), and several components use `bg-ink text-white` for dark buttons and selected states. In the dark theme `ink` becomes the light text colour, so those would turn white-on-white. Every `bg-ink`, `border-ink` and `text-white` use must move to purpose-named tokens (for example "selected" and "primary button", each with a matching text colour) defined for both themes.
- **Browser and install colours.**
  - In `web/index.html`, use two `theme-color` meta tags, one with `media="(prefers-color-scheme: dark)"` and one for light. When the user overrides the theme in Setup, the app updates the matching tag.
  - The PWA manifest in `web/vite.config.js` only takes one `background_color` / `theme_color`. Use the dark ground there: it's only the install splash screen.
- **Poster wall:** purely decorative (`aria-hidden`, empty alt text). Images load lazily and never delay the controls. If posters fail to load (offline, first run), tinted placeholder tiles fill the wall.
- **Phone width:** layout must hold at 360 px, the narrowest common Android width. The app is portrait-only and capped at 480 px wide.

## Testing

- `npm test` and `npm run build` pass.
- New unit test for the function that chooses the wall's posters: loved titles first, then watchlist, then popular; no duplicates; YouTube skipped; capped at the limit.
- New unit test that older backups without `settings.theme` load as `'system'`.
- Manual check in `npm run dev` at 360 px, **in both themes**:
  - every screen;
  - a pick card with long text over a bright poster and over a dark poster;
  - reduced-motion on;
  - offline after one load;
  - switching System / Light / Dark in Setup, and the phone's own setting changing while System is selected.

## Left to the builder

- Exact drift speeds, poster size on the wall, gradient stops and grain strength, within the demos' feel.
- Where the Theme choice sits in Setup and what the control looks like (the existing chip style fits).
- Where the wall-poster function lives (a small `lib/` module is the natural fit).
- Whether to keep the old token names with new values or rename them, as long as the white-on-white trap is handled.
