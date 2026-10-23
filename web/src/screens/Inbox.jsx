import { useMemo, useState } from 'react'
import { buildIndex, matchTitles } from '../lib/share.js'
import { Back, IconButton } from '../components/ui.jsx'

// Posts shared in from Instagram (or pasted on iPhone): confirm what they
// recommend. Confirmed titles count as the family's own recommendation.
export default function InboxScreen({ store, update, go, catalog, byId, incoming, clearIncoming }) {
  const items = catalog.status === 'ready' ? catalog.data.items : []
  const index = useMemo(() => buildIndex(items), [items])
  const [draft, setDraft] = useState(incoming?.text ?? '')
  const matches = useMemo(() => (draft ? matchTitles(draft, index) : []), [draft, index])
  const [unchecked, setUnchecked] = useState(() => new Set())

  const saveIt = () => {
    const ids = matches.filter((m) => !unchecked.has(m.id)).map((m) => m.id)
    update((s) => {
      s.saved.push({ text: draft.slice(0, 2000), url: incoming?.url ?? '', ids, at: Date.now() })
      return s
    })
    setDraft('')
    setUnchecked(new Set())
    clearIncoming()
  }

  return (
    <main className="flex flex-1 flex-col gap-4 px-5 pt-6 pb-7">
      <header className="flex items-center gap-3">
        <IconButton label="Back" onClick={() => go('pick')}><Back /></IconButton>
        <div>
          <h1 className="font-display text-[26px] leading-[1.1] font-bold">Saved finds</h1>
          <p className="text-sm text-muted">Share a reel to this app, or paste its caption</p>
        </div>
      </header>

      <label className="flex flex-col gap-2">
        <span className="text-[15px] font-semibold">Post text</span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          placeholder="Paste the caption or the titles from the post"
          className="rounded-2xl border border-line bg-card p-3 text-[15px]"
        />
      </label>

      {draft && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold">
            {matches.length ? 'We found these' : "No titles we know yet. Save it anyway and next week's search will look them up."}
          </h2>
          {matches.map((m) => (
            <label key={m.id} className="flex min-h-[52px] cursor-pointer items-center justify-between gap-3 rounded-xl border border-hair bg-card px-4">
              <span className="text-base font-medium">
                {m.name} {m.year ? <span className="text-muted">({m.year})</span> : null}
              </span>
              <input
                type="checkbox"
                className="size-[22px]"
                checked={!unchecked.has(m.id)}
                onChange={() =>
                  setUnchecked((u) => {
                    const n = new Set(u)
                    n.has(m.id) ? n.delete(m.id) : n.add(m.id)
                    return n
                  })
                }
              />
            </label>
          ))}
          <button type="button" onClick={saveIt} className="min-h-[52px] rounded-2xl bg-linear-to-b from-cta-from to-cta-to text-base font-semibold text-cta-ink">
            Save
          </button>
        </section>
      )}

      {store.saved.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold">Saved ({store.saved.length})</h2>
          {[...store.saved].reverse().slice(0, 30).map((s) => (
            <div key={s.at} className="rounded-xl border border-hair bg-card p-3 text-sm">
              <p className="font-medium">
                {s.ids.length ? s.ids.map((id) => byId.get(id)?.name ?? 'Unknown title').join(', ') : 'Waiting for next week’s lookup'}
              </p>
              <p className="line-clamp-2 text-muted">{s.text}</p>
            </div>
          ))}
        </section>
      )}
    </main>
  )
}
