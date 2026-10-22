import { useState } from 'react'
import { MOODS, TIMES, WHO } from '../lib/picker.js'
import { Chip, IconButton, Inbox, Pause, Play, Section, Sliders, ThumbUp } from '../components/ui.jsx'

const DAY = 864e5

export default function PickScreen({ store, go, catalog, byId, onPick, onFeedback }) {
  const [ask, setAsk] = useState(store.lastAsk)
  const [thanks, setThanks] = useState(null)
  const set = (k, v) => setAsk((a) => ({ ...a, [k]: a[k] === v && k === 'mood' ? null : v }))

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
  const platformsLabel = store.settings.platforms.length
    ? `From ${store.settings.platforms.length} platform${store.settings.platforms.length > 1 ? 's' : ''} you have`
    : 'Pick your platforms in setup first'

  return (
    <main className="flex min-h-full flex-1 flex-col gap-[22px] px-5 pt-7 pb-7">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted">Mealtime picks</p>
          <h1 className="font-display text-[32px] leading-[1.08] font-bold">What are we watching?</h1>
        </div>
        <div className="flex gap-2">
          <IconButton label="Saved from Instagram" onClick={() => go('inbox')}><Inbox /></IconButton>
          <IconButton label="Setup" onClick={() => go('setup')}><Sliders /></IconButton>
        </div>
      </header>

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

      <Section title="Mood">
        <div className="flex flex-wrap gap-2">
          {MOODS.map((m) => (
            <Chip key={m.id} on={ask.mood === m.id} onClick={() => set('mood', m.id)}>{m.label}</Chip>
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
          className="flex min-h-[58px] items-center justify-center gap-2.5 rounded-2xl bg-accent text-lg font-semibold text-white disabled:opacity-50"
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
