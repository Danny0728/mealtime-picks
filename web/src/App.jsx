import { useEffect, useMemo, useRef, useState } from 'react'
import { load, save } from './lib/store.js'
import { pick, updateWeights } from './lib/picker.js'
import { readShareParams } from './lib/share.js'
import { applyTheme } from './lib/theme.js'
import { toast } from './lib/toast.js'
import { stampChanges } from './lib/merge.js'
import { useAccount } from './lib/useAccount.js'
import Setup from './screens/Setup.jsx'
import PickScreen from './screens/Pick.jsx'
import Results from './screens/Results.jsx'
import SeenGrid from './screens/SeenGrid.jsx'
import InboxScreen from './screens/Inbox.jsx'
import Watchlist from './screens/Watchlist.jsx'
import Search from './screens/Search.jsx'
import Vault from './screens/Vault.jsx'
import Popular from './screens/Popular.jsx'
import { useVault } from './lib/useVault.js'
import { usePopular } from './lib/usePopular.js'

function useHashRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, '') || 'pick'
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => setRoute(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go = (r) => {
    window.location.hash = '/' + r
  }
  return [route, go]
}

function useCatalog() {
  const [state, setState] = useState({ status: 'loading' })
  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'catalog.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => setState({ status: 'ready', data }))
      .catch((error) => setState({ status: 'error', error }))
  }, [])
  return state
}

export default function App() {
  const [store, setStore] = useState(load)
  const [route, go] = useHashRoute()
  const catalog = useCatalog()
  const [results, setResults] = useState(null)
  const [incoming, setIncoming] = useState(null)

  // If this ever fails (storage full or blocked), say so once rather than
  // silently losing picks and feedback from here on.
  const saveWarned = useRef(false)
  useEffect(() => {
    if (!save(store) && !saveWarned.current) {
      saveWarned.current = true
      toast("Couldn't save to this device (storage full or blocked). Recent changes may not stick.")
    }
  }, [store])

  useEffect(() => applyTheme(store.settings.theme), [store.settings.theme])

  const account = useAccount(store, setStore)
  const vault = useVault(account.user)
  const loves = usePopular(account.user, store)

  // Short notes from anywhere (lib/toast.js), e.g. "Copied the title".
  const [note, setNote] = useState('')
  useEffect(() => {
    let timer
    const show = (e) => {
      setNote(e.detail)
      clearTimeout(timer)
      timer = setTimeout(() => setNote(''), 4500)
    }
    window.addEventListener('mealtime-toast', show)
    return () => {
      window.removeEventListener('mealtime-toast', show)
      clearTimeout(timer)
    }
  }, [])

  // A post shared into the app from Instagram (Android share sheet).
  useEffect(() => {
    const shared = readShareParams(window.location.search)
    if (shared) {
      setIncoming(shared)
      window.history.replaceState(null, '', window.location.pathname + '#/inbox')
      go('inbox')
    } else if (!store.settings.onboarded) {
      go('setup')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const items = catalog.status === 'ready' ? catalog.data.items : []
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  // Every change is time-stamped here, so sync can merge copies from other devices.
  const update = (fn) => setStore((s) => stampChanges(s, fn(structuredClone(s)), Date.now()))

  const runPick = (ask, extraExclude = []) => {
    if (catalog.status !== 'ready') return
    const session = crypto.randomUUID?.() ?? String(Date.now())
    const view = { ...store, seen: [...store.seen, ...extraExclude], vault: vault.ids }
    const { picks, poolSize, moodMatched } = pick(catalog.data, view, ask)
    const now = Date.now()
    update((s) => {
      s.lastAsk = ask
      for (const p of picks) for (const it of p.items) s.history.push({ id: it.id, status: 'shown', feedback: null, at: now, session })
      return s
    })
    setResults({ ask, picks, poolSize, moodMatched, session })
    go('results')
  }

  const markPicked = (p) => {
    const now = Date.now()
    update((s) => {
      for (const it of p.items) {
        const entry = { id: it.id, status: 'picked', feedback: null, at: now, session: results?.session, factors: p.factors }
        if (p.episodes) {
          const from = p.epFrom ?? 1
          entry.ep = { from, to: from + p.episodes - 1 }
        }
        s.history.push(entry)
      }
      return s
    })
  }

  // Take a pick off the screen and fill its slot with something new, so there
  // are still three to compare. `change` applies the reason it went (seen,
  // saved for later) to the store, and the replacement is chosen with it applied.
  const replacePick = (p, change) => {
    if (!results) return
    const next = change(structuredClone(store))
    const shownThisRound = next.history.filter((h) => h.session === results.session).map((h) => h.id)
    const keep = results.picks.filter((x) => x.key !== p.key)
    const view = { ...next, seen: [...next.seen, ...shownThisRound], vault: vault.ids }
    const picks = catalog.status === 'ready' ? pick(catalog.data, view, results.ask, Math.random, keep).picks : keep
    const now = Date.now()
    for (const a of picks.slice(keep.length)) {
      for (const it of a.items) next.history.push({ id: it.id, status: 'shown', feedback: null, at: now, session: results.session })
    }
    setStore(stampChanges(store, next, now))
    setResults((r) => r && { ...r, picks })
  }

  // Already watched: remember how it went.
  const markSeen = (p, rating) =>
    replacePick(p, (s) => {
      for (const it of p.items) {
        if (!s.seen.includes(it.id)) s.seen.push(it.id)
        if (rating) s.seenRatings[it.id] = rating
      }
      return s
    })

  // Sounds good, not tonight.
  const saveForLater = (p) =>
    replacePick(p, (s) => {
      const now = Date.now()
      for (const it of p.items) if (!s.watchlist.some((w) => w.id === it.id)) s.watchlist.push({ id: it.id, name: it.name, at: now })
      return s
    })

  // Watching something from the watchlist counts as a pick, so the usual
  // "how was it?" follows next time.
  const watchFromList = (id) =>
    update((s) => {
      s.watchlist = s.watchlist.filter((w) => w.id !== id)
      s.history.push({ id, status: 'picked', feedback: null, at: Date.now(), session: 'watchlist' })
      return s
    })

  const removeFromList = (id) =>
    update((s) => {
      s.watchlist = s.watchlist.filter((w) => w.id !== id)
      return s
    })

  // From search: mark seen / unmark, and save for later / unsave.
  const toggleSeen = (id) =>
    update((s) => {
      s.seen = s.seen.includes(id) ? s.seen.filter((x) => x !== id) : [...s.seen, id]
      return s
    })
  const toggleLater = (item) =>
    update((s) => {
      s.watchlist = s.watchlist.some((w) => w.id === item.id)
        ? s.watchlist.filter((w) => w.id !== item.id)
        : [...s.watchlist, { id: item.id, name: item.name, at: Date.now() }]
      return s
    })

  const giveFeedback = (entryAt, value) => {
    update((s) => {
      const picked = s.history.filter((h) => h.status === 'picked' && h.at === entryAt)
      for (const h of picked) {
        h.feedback = value
        s.weights = updateWeights(s.weights, h.factors, value)
      }
      return s
    })
  }

  const common = { store, update, go, catalog, byId, account, vault }

  let screen
  switch (route) {
    case 'setup':
      screen = <Setup {...common} />
      break
    case 'seen':
      screen = <SeenGrid {...common} />
      break
    case 'watchlist':
      screen = <Watchlist {...common} onWatch={watchFromList} onRemove={removeFromList} />
      break
    case 'search':
      // The owner's tool; anyone else landing here gets the home screen.
      screen = vault.admin
        ? <Search {...common} onSeen={toggleSeen} onLater={toggleLater} />
        : <PickScreen {...common} onPick={runPick} onFeedback={giveFeedback} />
      break
    case 'vault':
      screen = <Vault {...common} onLater={toggleLater} />
      break
    case 'popular':
      screen = <Popular {...common} loves={loves} onLater={toggleLater} />
      break
    case 'inbox':
      screen = <InboxScreen {...common} incoming={incoming} clearIncoming={() => setIncoming(null)} />
      break
    case 'results':
      screen = results ? (
        <Results
          {...common}
          results={results}
          onPicked={markPicked}
          onSeen={markSeen}
          onLater={saveForLater}
          onShuffle={() => runPick(results.ask, results.picks.flatMap((p) => p.items.map((i) => i.id)))}
        />
      ) : (
        <PickScreen {...common} onPick={runPick} onFeedback={giveFeedback} />
      )
      break
    default:
      screen = <PickScreen {...common} onPick={runPick} onFeedback={giveFeedback} />
  }

  // Phone-width column; laptops get the room (each screen decides how to use it).
  return (
    <div className="grain relative mx-auto flex min-h-full max-w-[480px] flex-col lg:max-w-[1200px]">
      {screen}
      {/* A failed Vault save, wherever it happened (owner only). */}
      {note && !vault.error && (
        <div role="status" className="safe-b-4 fixed inset-x-4 z-50 mx-auto max-w-[460px] rounded-2xl border border-line bg-card p-4 text-[13px] text-ink shadow-xl">
          {note}
        </div>
      )}
      {vault.error && (
        <div role="alert" className="safe-b-4 fixed inset-x-4 z-50 mx-auto flex max-w-[460px] items-start gap-3 rounded-2xl border border-line bg-card p-4 text-[13px] text-ink shadow-xl">
          <p className="flex-1">{vault.error}</p>
          <button type="button" onClick={vault.clearError} aria-label="Dismiss" className="font-semibold text-gold">OK</button>
        </div>
      )}
    </div>
  )
}
