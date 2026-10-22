import { useRef, useState } from 'react'
import { ALL_LANGUAGES, ALL_PLATFORMS, exportBackup, importBackup } from '../lib/store.js'
import { Chip, Section } from '../components/ui.jsx'

export default function Setup({ store, update, go, catalog }) {
  const fileRef = useRef(null)
  const [msg, setMsg] = useState('')
  const s = store.settings

  const toggle = (key, id) =>
    update((st) => {
      const list = st.settings[key]
      st.settings[key] = list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
      return st
    })

  const onImport = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const next = await importBackup(f)
      update(() => next)
      setMsg('Backup restored.')
    } catch {
      setMsg("That file isn't a Mealtime backup.")
    }
    e.target.value = ''
  }

  const done = () => {
    update((st) => {
      st.settings.onboarded = true
      return st
    })
    go('pick')
  }

  return (
    <main className="flex min-h-full flex-1 flex-col gap-5 px-5 pt-6 pb-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted">One-time setup</p>
          <h1 className="font-display text-[28px] leading-[1.1] font-bold">Your household</h1>
        </div>
        <button type="button" onClick={done} className="min-h-11 rounded-xl bg-ink px-[18px] text-[15px] font-semibold text-white">
          Done
        </button>
      </header>

      <Section title="What you have">
        <div className="flex flex-col rounded-2xl border border-hair bg-card">
          {ALL_PLATFORMS.map((p, i) => (
            <label
              key={p.id}
              className={`flex min-h-[52px] cursor-pointer items-center justify-between gap-3 px-4 ${i < ALL_PLATFORMS.length - 1 ? 'border-b border-chip' : ''}`}
            >
              <span className="text-base font-medium">{p.label}</span>
              <input type="checkbox" className="size-[22px]" checked={s.platforms.includes(p.id)} onChange={() => toggle('platforms', p.id)} />
            </label>
          ))}
        </div>
      </Section>

      <Section title="Languages">
        <div className="flex flex-wrap gap-2">
          {ALL_LANGUAGES.map((l) => (
            <Chip key={l.id} on={s.languages.includes(l.id)} onClick={() => toggle('languages', l.id)}>{l.label}</Chip>
          ))}
        </div>
      </Section>

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-hair bg-card px-4 py-3.5">
        <span className="flex flex-col gap-0.5">
          <span className="text-base font-semibold">Family-safe only</span>
          <span className="text-[13px] text-muted">Hide anything you wouldn't watch with kids at the table</span>
        </span>
        <input
          type="checkbox"
          className="size-[22px] shrink-0"
          checked={s.familySafe}
          onChange={() => update((st) => ((st.settings.familySafe = !st.settings.familySafe), st))}
        />
      </label>

      <Section title="Already watched" hint="Tap the popular ones you've seen so they never come up.">
        <button
          type="button"
          disabled={catalog.status !== 'ready'}
          onClick={() => go('seen')}
          className="min-h-11 rounded-xl border border-line bg-card text-sm font-semibold disabled:opacity-50"
        >
          Mark what we've seen ({store.seen.length})
        </button>
      </Section>

      <Section title="Your history" hint="Saved on this device only. Export it now and then, and commit it as data/feedback.json so next week's search learns from it.">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => exportBackup(store)} className="min-h-11 rounded-xl border border-line bg-card text-sm font-semibold">
            Export backup
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="min-h-11 rounded-xl border border-line bg-card text-sm font-semibold">
            Import backup
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
        </div>
        {msg && <p className="text-[13px] text-good">{msg}</p>}
      </Section>

      <p className="mt-auto text-center text-xs text-muted">
        {catalog.status === 'ready' ? catalog.data.attribution : 'Title data from TMDB. Where-to-watch data from JustWatch via TMDB.'}
      </p>
    </main>
  )
}
