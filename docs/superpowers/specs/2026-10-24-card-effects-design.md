# Card effects

Approved demos (local only, throwaway prototypes):
- `.superpowers/brainstorm/1386-1792819782/content/themed-cards-v26.html`: every effect, one card each.
- `picks-experience.html`, in the same folder: the realistic test, with random rounds from the real catalog, the selection rules and the stagger.

Where they and this document disagree, this document wins.

## Why

The owner wants each pick card to feel like its title. Every card gets a short entrance moment that matches its genre: lights going out for horror, curtains parting for drama, bullet holes for a gunfight. The goal is a cinematic touch, not a gimmick. Several effects were tried and dropped along the way: blood, drawn sword slashes, manga speed lines, comic sound effects, ink brush, sakura and the sun flare.

## Goals

- **One moment per card:** every pick card on the Results screen gets one quiet themed moment when it arrives, then settles into a clean, readable card.
- **Effects match the title:** chosen by genre and mood, plus a weapon accent from words in the description.
- **Calm, not busy:**
  - a card plays only once it's actually on screen;
  - only one card plays at a time;
  - repeats are toned down to a quick glint.

## Non-goals

- Effects on the Watchlist, Seen grid or any other screen.
- Settings or a speed slider. The speed is fixed (see Timing).
- Changes to the catalog or the weekly fetch. Everything uses fields the catalog already has: `genres`, `moods`, `kind` and `overview`.

## Anti-goals

- **Gore or shock content.** No blood. Horror is atmospheric only.
- **Effects in the way of reading.** Anything drawn over text must be gone within about 3.5 s.
- **Effects that make the card look like it reloads.** The card is already showing when its moment plays, so an effect must never hide, blank, fade out or blur the card's content, or the whole card. Darkening, blurring, greyscale and sepia go on the poster only; everything else is an overlay on top. (The owner found the vanish-and-come-back effects irritating.)
- **Effects starting together.** Cards never start at the same moment; they're staggered 0.8 s apart, so effects overlap at most in their tails. The exception is the person tapping posters themselves.
- **Motion for people who asked for none.** With `prefers-reduced-motion: reduce`, no effects at all, including no glint.
- **Jank.** The effect markup is created when a card plays and removed when it ends. Nothing keeps animating off-screen.

## Choosing a card's effect

**1. Genre theme.** Take the first match in this priority order across the item's genres and moods. TMDB genre names are used as they appear in the catalog:

| Priority | Match | Theme |
|---|---|---|
| 1 | `Horror` | horror (one of three, at random) |
| 2 | mood `anime` ≥ 0.5 | anime (one of three, at random) |
| 3 | `War`, `War & Politics` | war |
| 4 | `Crime` | crime |
| 5 | `Mystery` | mystery |
| 6 | `Thriller` | thriller |
| 7 | `Science Fiction`, `Sci-Fi & Fantasy` | scifi |
| 8 | `Fantasy` | fantasy |
| 9 | `Adventure`, `Action & Adventure` | adventure |
| 10 | `Action` | action |
| 11 | `Animation` | animation |
| 12 | `Comedy`, or mood `standup` ≥ 0.5 when `kind` is `youtube` | comedy, or standup for YouTube |
| 13 | `Romance` | romance |
| 14 | `Music` | music |
| 15 | `History` | history |
| 16 | `Documentary` | docu |
| 17 | `Family`, `Kids` | family |
| 18 | mood `sports` ≥ 0.5 | sports |
| 19 | `Drama` | drama |
| 20 | `Western` | western |
| 21 | `Reality`, `Talk`, `News` | live |
| 22 | anything else (`Soap`, `TV Movie`, no genres) | plain |

**2. Weapon accent** (at most one), from the item's `overview`, case-insensitive, whole words:
- **Sword words:** sword, swords, katana, samurai, blade, blades, ninja, swordsman, swordsmen.
- **Gun words:** gun, guns, gunfight, shootout, shot, shoots, shooting, sniper, hitman, assassin, assassins, gangster, bullet, bullets.
- **Sword words found:** the **slice**, even if gun words are also present.
- **Only gun words found:** **bullet holes**.
- **How it combines:** the accent plays on top of the genre theme. The one exception is the **action** theme, where the accent *replaces* the impact.
- **Combos are a single moment:** combo cards (two YouTube videos) get the theme of their first video and no accent.

**3. Random variants.** For horror and anime, the variant is picked at random each time the card plays, including on tap-to-replay.

## The effects

The demo's CSS and drawing code are the reference for how each one looks.

| Theme | Moment |
|---|---|
| horror: **lights out** | flicker in; the card goes nearly black while the poster twitches with a red/blue split; the light stutters back |
| horror: **someone walks past** | the card dims; a blurred head-and-shoulders shadow crosses behind it |
| horror: **bad tape** | VHS tear: slices jump, colour split, a rolling tracking line, a burst of static |
| anime: **manga to anime** | greyscale poster with halftone dots (poster only) and a white panel border; colour sweeps in left to right |
| anime: **eyecatch wipe** | a bold gold diagonal band, with a thin white stripe just behind, sweeps across like an anime scene transition; the card's content snaps in behind them with a 14 px slide; the bands exit on the far side |
| anime: **kira-kira** | three small four-pointed glints twinkle on and around the poster, in turn |
| war | embers rise from the bottom; two distant orange flashes |
| crime | yellow "DO NOT CROSS" tape slaps across the top-right corner, then peels away |
| mystery | the card starts blurred; a magnifying lens sweeps across and leaves it sharp |
| thriller | the border pulses red like a heartbeat, three beats |
| scifi | one blue scan line sweeps down; a neon edge fades out |
| fantasy | a ring of glowing runes (ᚠᚢᚦᚨᚱᚲᚷᚹ) turns around the poster |
| adventure | a dotted gold trail traces the border; a compass swings to north in the bottom-right |
| action | **impact**: the card jolts; a shockwave ring pulses out from the poster; a red edge flash |
| animation | squash-and-stretch entrance with a bold ink outline |
| comedy | bounce in; 😂 ✨ 😄 pop off the top-right corner |
| standup | a warm spotlight cone swings onto the card |
| romance | warm glow; three 💛 float up |
| music | an equaliser bounces along the bottom edge |
| history | the poster develops out of sepia; aged-paper edge shadow |
| docu | film-reel sprocket holes run down both edges |
| family | a burst of pastel confetti from the centre |
| sports | a stadium-light flare sweeps once; a ⚽ bounces across |
| drama | dark red velvet curtains part from the middle |
| western | a gust of dust blows across; sun-bleached edge glow |
| live | a red "● LIVE" tag blinks in the top-right, then goes |
| plain | a gold shimmer along the edge |
| accent: **slice** | a random diagonal; a white glowing cut line draws along it; the top part of the card slides about 8 px along the cut and back. The line, top copy and bottom copy all share the card's padding box so they meet exactly (see Traps) |
| accent: **bullet holes** | 2–4 holes at random spots, kept off the poster column: a muzzle flash, then a ragged black hole in a jagged grey shard (dark near the hole, lighter towards spiky points) with flying chips and a small card kick; each fades out about 1.5 s after it lands |

## Timing and playing rules

- **Speed:** every effect runs at **0.55×** the demo's base speed, so durations in the demo CSS are divided by 0.55. Bake this into the CSS values; there's no playback-rate trick and no slider.
- **Plays when visible:** a card's effect starts when at least 60% of the card is on screen (IntersectionObserver), like autoplay on Instagram.
- **One after another, staggered:** cards waiting to play are queued in screen order (top to bottom, then left to right on laptop layouts). Each starts **0.8 s after the previous one began**, without waiting for it to finish. Waiting for the full effect (2–6 s at 0.55×) made later cards feel stuck; the owner approved the stagger in the test demo.
- **Once per round:** each card plays automatically once per round of picks. Scrolling back shows it clean. A new round (Itadakimasu, "What else is cooking?", or a replacement after Seen it or Later) plays again.
- **Repeats get a glint:** a title already shown in an earlier round gets only a 0.6 s glint of its theme's colour. "Shown before" means it appears in `store.history` with `status: 'shown'` from a *different* session than the current round.
- **Tap to replay:** tapping a card's poster replays its full effect immediately, outside the queue. Tapping several posters plays them at the same time, on purpose.
- **Settling:** before playing, a waiting card shows normally. Don't dim it; the demo's dimming was only there for the demo.

## Constraints and known traps

- **The slice must use one shared box.** The two content copies and the cut-line SVG are all `position: absolute; inset: 0` inside the card, the copies with the card's own padding. The SVG needs an explicit `width: 100%; height: 100%`, because without it SVG falls back to a small default size and the line is drawn in the wrong place. The original content is `visibility: hidden` while the copies are shown. This was the cause of two failed demo rounds.
- **Hide the right things.** The original content is hidden during the slice only; the card's background, border and poster glow (from the redesign) stay.
- **Light theme:** white-on-white effects (kira glints, cut line, the eyecatch's white stripe) need a darker glow so they read on the paper background. Check each effect in both themes.
- **Clean up.** Every injected element is removed when its effect ends, and on unmount. Replaying first clears the previous run's elements.
- **Combos and continue picks** use the same rules, based on their first item.

## Testing

- **Unit tests** for the pure chooser `effectFor(item) → { theme, variant?, weapon? }`, covering:
  - the genre priority (Horror beats Comedy; anime mood beats Action);
  - sword words beating gun words;
  - gun words alone giving bullets;
  - an action theme with a weapon getting no impact;
  - the YouTube stand-up case;
  - unknown genres falling back to `plain`;
  - whole-word matching ("shotgun" is not "shot"; "Assassin's Creed" counts).
- **Unit test** for the shown-before rule, from store history.
- **Manual checks** in `npm run dev` at 360 px and laptop width, both themes:
  - each theme, using titles found in the catalog;
  - scroll-to-play and one-at-a-time;
  - tap to replay;
  - the glint on a second round;
  - reduced motion turns everything off;
  - the slice line sitting on the seam, at several angles.

## Left to the builder

- File layout. Suggested: `lib/fx.js` (pure chooser and the word lists), `components/CardFx.jsx` (plays an effect into a card), `fx.css` (the effects).
- Exact random ranges, within what the demo uses.
- Glint colours per theme (the demo's `GLINT` table is a fine start).
