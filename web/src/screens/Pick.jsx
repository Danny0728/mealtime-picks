import { useMemo, useState } from 'react'
import { MOODS, TIMES, WHO } from '../lib/picker.js'
import { wallPosters } from '../lib/wall.js'
import PosterWall from '../components/PosterWall.jsx'
import { Bookmark, Chip, IconButton, Inbox, Pause, Play, Section, Sliders, ThumbUp } from '../components/ui.jsx'

const DAY = 864e5

export default function PickScreen({ store, go, catalog, byId, onPick, onFeedback }) {
  const [ask, setAsk] = useState(store.lastAsk)
  const [thanks, setThanks] = useState(null)
  const set = (k, v) => setAsk((a) => ({ ...a, [k]: v }))
  // Moods are a multi-select: several mean any of them.
  const toggleMood = (m) =>
    setAsk((a) => ({ ...a, moods: a.moods.includes(m) ? a.moods.filter((x) => x !== m) : [...a.moods, m] }))

  // The most recent pick nobody has rated yet (within a week).
  const pending = [...store.history]
    .reverse()
    .find((h) => h.status === 'picked' && !h.feedback && Date.now() - h.at < 7 * DAY)
  const pendingItem = pending && byId.get(pending.id)

  const rate = (value, label) => {
    onFeedback(pending.at, value)
    setThanks(label)
  }

  const ready = catalog.status === 'ready'
  const posters = useMemo(
    () => wallPosters(ready ? catalog.data.items : [], store),
    [ready, catalog, store],
  )
  const platformsLabel = store.settings.platforms.length
    ? `From ${store.settings.platforms.length} platform${store.settings.platforms.length > 1 ? 's' : ''} you have`
    : 'Pick your platforms in setup first'

  return (
    <main className="relative isolate flex min-h-full flex-1 flex-col gap-[22px] overflow-hidden px-5 pt-6 pb-7">
      <div className="absolute inset-0 -z-10"><PosterWall posters={posters} /></div>
      <header className="flex items-center justify-between gap-3">
        <p className="font-display text-xl tracking-[0.14em] text-gold">MEALTIME PICKS</p>
        <div className="flex gap-2">
          <IconButton label={`Watchlist (${store.watchlist.length})`} onClick={() => go('watchlist')}>
            <Bookmark size={20} />
            {store.watchlist.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 rounded-full bg-linear-to-b from-cta-from to-cta-to px-1 text-center text-[11px] leading-5 font-bold text-cta-ink">
                {store.watchlist.length}
              </span>
            )}
          </IconButton>
          <IconButton label="Saved from Instagram" onClick={() => go('inbox')}><Inbox /></IconButton>
          <IconButton label="Setup" onClick={() => go('setup')}><Sliders /></IconButton>
        </div>
      </header>

      <div className="mt-[150px] flex flex-col gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">Tonight's showing</p>
        <h1 className="font-display text-[52px] leading-[0.92] [text-shadow:0_4px_24px_var(--color-ground)]">
          What are we<br />watching?
        </h1>
      </div>

      {pendingItem && !thanks && (
        <div className="flex flex-col gap-3 rounded-2xl border border-hair bg-card p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Last time</p>
            <p className="text-[17px] font-semibold">{pendingItem.name}</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <FeedbackButton onClick={() => rate('liked', 'liked it')}><ThumbUp /> Liked</FeedbackButton>
            <FeedbackButton onClick={() => rate('disliked', 'not for you')}><ThumbUp down /> Nah</FeedbackButton>
            <FeedbackButton onClick={() => rate('unfinished', "didn't finish")}><Pause /> Didn't finish</FeedbackButton>
          </div>
        </div>
      )}
      {thanks && (
        <p className="rounded-2xl bg-good-bg px-4 py-3.5 text-[15px] font-medium text-good">
          Noted: {thanks}. That helps the next picks.
        </p>
      )}

      <Section title="Time we have">
        <div className="grid grid-cols-4 gap-2">
          {TIMES.map((t) => (
            <Chip key={t.id} on={ask.time === t.id} onClick={() => set('time', t.id)}>{t.label}</Chip>
          ))}
        </div>
      </Section>

      <Section title="Mood" hint="Pick any you're up for, or none for anything.">

        <div className="flex flex-wrap gap-2">
          {MOODS.map((m) => (
            <Chip key={m.id} on={ask.moods.includes(m.id)} onClick={() => toggleMood(m.id)}>{m.label}</Chip>
          ))}
        </div>
      </Section>

      <Section title="Who's watching">
        <div className="flex flex-wrap gap-2">
          {WHO.map((w) => (
            <Chip key={w.id} on={ask.who === w.id} onClick={() => set('who', w.id)}>{w.label}</Chip>
          ))}
        </div>
      </Section>

      <div className="flex-1" />

      <div className="flex flex-col gap-2.5">
        {catalog.status === 'error' && (
          <p className="text-center text-[13px] text-accent-ink">Couldn't load this week's list. Check your connection.</p>
        )}
        {ready && catalog.data.sample && (
          <p className="text-center text-[13px] text-muted">Showing sample data until the weekly fetch runs.</p>
        )}
        <p className="text-center text-[13px] text-muted">{platformsLabel}</p>
        <button
          type="button"
          disabled={!ready || !store.settings.platforms.length}
          onClick={() => onPick(ask)}
          className="flex min-h-[58px] items-center justify-center gap-2.5 rounded-2xl bg-linear-to-b from-cta-from to-cta-to text-lg font-bold text-cta-ink shadow-[0_10px_30px_rgba(242,181,68,0.25)] disabled:opacity-50"
        >
          <Play /> {ready ? 'Pick 3 for us' : 'Loading…'}
        </button>
      </div>
    </main>
  )
}

function FeedbackButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card text-sm font-semibold"
    >
      {children}
    </button>
  )
}
