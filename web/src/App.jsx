import { useEffect, useMemo, useState } from 'react'
import { load, save } from './lib/store.js'
import { pick, updateWeights } from './lib/picker.js'
import { readShareParams } from './lib/share.js'
import Setup from './screens/Setup.jsx'
import PickScreen from './screens/Pick.jsx'
import Results from './screens/Results.jsx'
import SeenGrid from './screens/SeenGrid.jsx'
import InboxScreen from './screens/Inbox.jsx'
import Watchlist from './screens/Watchlist.jsx'

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

  useEffect(() => {
    save(store)
  }, [store])

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

  const update = (fn) => setStore((s) => fn(structuredClone(s)))

  const runPick = (ask, extraExclude = []) => {
    if (catalog.status !== 'ready') return
    const session = crypto.randomUUID?.() ?? String(Date.now())
    const view = { ...store, seen: [...store.seen, ...extraExclude] }
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
    const view = { ...next, seen: [...next.seen, ...shownThisRound] }
    const picks = catalog.status === 'ready' ? pick(catalog.data, view, results.ask, Math.random, keep).picks : keep
    const now = Date.now()
    for (const a of picks.slice(keep.length)) {
      for (const it of a.items) next.history.push({ id: it.id, status: 'shown', feedback: null, at: now, session: results.session })
    }
    setStore(next)
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

  const common = { store, update, go, catalog, byId }

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

  return <div className="mx-auto flex min-h-full max-w-[480px] flex-col">{screen}</div>
}
