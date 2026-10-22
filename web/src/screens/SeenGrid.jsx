import { SEEN_RATINGS } from '../lib/store.js'
import { Back, IconButton } from '../components/ui.jsx'

// The obvious titles everyone has seen: one tap each removes them for good,
// and an optional "how was it?" teaches the picker the family's taste.
export default function SeenGrid({ store, update, go, catalog }) {
  const mine = new Set(store.settings.platforms)
  const items = catalog.status === 'ready'
    ? catalog.data.items.filter((i) => i.popular && i.providers.some((p) => mine.has(p)))
    : []
  const seen = new Set(store.seen)
  const toggle = (id) =>
    update((s) => {
      if (s.seen.includes(id)) {
        s.seen = s.seen.filter((x) => x !== id)
        delete s.seenRatings[id]
      } else {
        s.seen = [...s.seen, id]
      }
      return s
    })
  const rate = (id, value) =>
    update((s) => {
      if (s.seenRatings[id] === value) delete s.seenRatings[id]
      else s.seenRatings[id] = value
      return s
    })

  return (
    <main className="flex flex-1 flex-col gap-4 px-5 pt-6 pb-7">
      <header className="flex items-center gap-3">
        <IconButton label="Back" onClick={() => go('setup')}><Back /></IconButton>
        <div>
          <h1 className="font-display text-[26px] leading-[1.1] font-bold">Seen any of these?</h1>
          <p className="text-sm text-muted">{seen.size} marked · say how they were to sharpen your picks</p>
        </div>
      </header>
      {!items.length && <p className="text-[15px] text-soft">Nothing to show for your platforms yet.</p>}
      <div className="grid grid-cols-3 gap-2.5">
        {items.map((it) => {
          const on = seen.has(it.id)
          const rating = store.seenRatings[it.id]
          return (
            <div key={it.id} className="flex flex-col gap-1">
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(it.id)}
                className={`flex flex-col gap-1.5 rounded-xl border p-1.5 text-left ${on ? 'border-ink bg-ink text-white' : 'border-hair bg-card'}`}
              >
                {it.poster ? (
                  <img src={it.poster} alt="" loading="lazy" className={`aspect-[2/3] w-full rounded-lg object-cover ${on ? 'opacity-50' : ''}`} />
                ) : (
                  <div className="aspect-[2/3] w-full rounded-lg bg-chip" />
                )}
                <span className="line-clamp-2 text-[13px] leading-tight font-medium">{it.name}</span>
              </button>
              {on && (
                <div role="group" aria-label={`How was ${it.name}?`} className="grid grid-cols-3 gap-1">
                  {SEEN_RATINGS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      aria-label={r.label}
                      aria-pressed={rating === r.id}
                      onClick={() => rate(it.id, r.id)}
                      className={`min-h-9 rounded-lg border text-[12px] font-semibold ${rating === r.id ? 'border-ink bg-ink text-white' : 'border-line bg-card'}`}
                    >
                      {r.short}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <button type="button" onClick={() => go('setup')} className="sticky bottom-4 min-h-[52px] rounded-2xl bg-ink text-base font-semibold text-white">
        Done
      </button>
    </main>
  )
}
