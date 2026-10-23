import { useState } from 'react'
import { MOODS, TIMES, WHO } from '../lib/picker.js'
import { ALL_PLATFORMS, SEEN_RATINGS } from '../lib/store.js'
import { Back, Badge, Bookmark, External, IconButton, Poster, Shuffle } from '../components/ui.jsx'

const label = (list, id) => list.find((x) => x.id === id)?.label
export const platformName = (id) => ALL_PLATFORMS.find((p) => p.id === id)?.label ?? id

// Where the "Open" button goes. Platform search pages are the most reliable
// deep link we have; TMDB's watch page (JustWatch data) is the fallback.
export function openUrl(item, platform) {
  const q = encodeURIComponent(item.name)
  switch (platform) {
    case 'youtube':
      return item.link || `https://www.youtube.com/results?search_query=${q}`
    case 'netflix':
      return `https://www.netflix.com/search?q=${q}`
    case 'prime':
      return `https://www.primevideo.com/search/?phrase=${q}`
    default:
      return item.link || `https://www.themoviedb.org/search?query=${q}`
  }
}

export default function Results({ store, go, results, onPicked, onSeen, onLater, onShuffle }) {
  const { ask, picks } = results
  const [rating, setRating] = useState(null) // key of the pick asking "How was it?"
  const summary = [label(TIMES, ask.time), label(MOODS, ask.mood), label(WHO, ask.who)].filter(Boolean).join(' · ')
  const mine = new Set(store.settings.platforms)

  return (
    <main className="flex min-h-full flex-1 flex-col gap-4 px-5 pt-6 pb-7">
      <header className="flex items-center gap-3">
        <IconButton label="Back" onClick={() => go('pick')}><Back /></IconButton>
        <div>
          <h1 className="font-display text-[26px] leading-[1.1] font-bold">
            {picks.length ? `Here ${picks.length === 1 ? 'is 1' : `are ${picks.length}`}` : 'Nothing fits yet'}
          </h1>
          <p className="text-sm text-muted">{summary}</p>
        </div>
      </header>

      {picks.length > 0 && results.moodMatched === false && (
        <p className="rounded-2xl bg-chip px-4 py-3 text-sm text-soft">
          Not much for that mood on your platforms this week, so these are the best of the rest.
        </p>
      )}

      {!picks.length && (
        <p className="rounded-2xl border border-hair bg-card p-4 text-[15px] text-soft">
          Nothing matches all of that. Try more time, another mood, or add a platform in setup.
        </p>
      )}

      {picks.map((p) => {
        const main = p.items[0]
        const platform = main.providers.find((x) => mine.has(x)) ?? main.providers[0]
        const title = p.kind === 'combo' ? p.items.map((i) => i.name).join(' + ') : main.name
        const when =
          p.kind === 'continue'
            ? `Episodes ${p.epFrom}–${p.epFrom + p.episodes - 1}`
            : p.episodes
              ? `Episode${p.episodes > 1 ? `s 1–${p.episodes}` : ' 1'}`
              : null
        return (
          <article key={p.key} className="flex flex-col gap-3 rounded-[18px] border border-hair bg-card p-3">
            <div className="flex gap-3">
              <Poster item={main} count={p.items.length} />
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap gap-1.5">
                  <Badge>{platformName(platform)}</Badge>
                  {p.minutes ? <Badge>{p.kind === 'combo' ? `~${p.minutes} min total` : `${p.minutes} min`}</Badge> : null}
                  {when && <Badge>{when}</Badge>}
                </div>
                <h2 className="text-[17px] leading-tight font-semibold">
                  {title}
                  {main.year && p.kind !== 'combo' ? <span className="font-normal text-muted"> ({main.year})</span> : null}
                </h2>
                <p className="text-sm leading-snug text-soft">{p.reason}</p>
              </div>
            </div>
            {rating === p.key ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold">How was it?</p>
                <div className="grid grid-cols-3 gap-2">
                  {SEEN_RATINGS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => { setRating(null); onSeen(p, r.id) }}
                      className="min-h-11 rounded-xl border border-line bg-card px-1 text-sm font-semibold"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => { setRating(null); onSeen(p, null) }} className="min-h-9 text-sm text-muted">
                  Skip
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                <a
                  href={openUrl(main, platform)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => onPicked(p)}
                  className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-ink px-2 text-sm font-semibold text-white"
                >
                  {p.kind === 'combo' ? 'Play first' : `Open ${platformName(platform)}`} <External />
                </a>
                <button
                  type="button"
                  onClick={() => setRating(p.key)}
                  className="min-h-11 rounded-xl border border-line bg-card px-3 text-sm font-semibold"
                >
                  Seen it
                </button>
                <button
                  type="button"
                  onClick={() => onLater(p)}
                  className="flex min-h-11 items-center gap-1 rounded-xl border border-line bg-card px-3 text-sm font-semibold"
                >
                  <Bookmark /> Later
                </button>
              </div>
            )}
          </article>
        )
      })}

      <div className="flex-1" />

      <button
        type="button"
        onClick={onShuffle}
        className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-accent bg-card text-base font-semibold text-accent"
      >
        <Shuffle /> Shuffle for 3 new ones
      </button>
    </main>
  )
}
