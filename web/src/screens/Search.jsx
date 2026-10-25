import { useEffect, useMemo, useRef, useState } from 'react'
import { Back, Badge, Bookmark, External, GridIcon, IconButton, ListIcon, OpenLink, Poster } from '../components/ui.jsx'
import { CardGrid, TitleCard } from '../components/TitleCard.jsx'
import { searchCatalog } from '../lib/search.js'
import { openUrl, platformName } from './Results.jsx'
import { VaultButton } from './Vault.jsx'
import { copyTitleFor } from '../lib/toast.js'

// Tiles or list, remembered on this device (a per-viewer convenience).
const VIEW_KEY = 'mealtime-picks:search-view'
function readView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'tiles'
  } catch {
    return 'tiles'
  }
}

// Find any title in this week's catalog: see where it streams, mark it seen,
// save it for later, and (for the owner) add it to the Vault.
const PAGE = 40

export default function Search({ store, go, catalog, vault, onSeen, onLater }) {
  const [query, setQuery] = useState('')
  const items = catalog.status === 'ready' ? catalog.data.items : []
  const typed = query.trim().length
  const browsing = typed < 2
  // Nothing typed yet: browse the week's films and series, best first, a page
  // at a time (YouTube videos would otherwise crowd the top; typing finds them).
  const all = useMemo(() => items.filter((i) => i.kind !== 'youtube').sort((a, b) => (b.q ?? 0) - (a.q ?? 0)), [items])
  const [shown, setShown] = useState(PAGE)
  const results = useMemo(() => (browsing ? all.slice(0, shown) : searchCatalog(items, query)), [browsing, all, shown, items, query])
  const more = useRef(null)
  useEffect(() => {
    if (!browsing || !more.current || typeof IntersectionObserver !== 'function') return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setShown((n) => Math.min(n + PAGE, all.length))
    }, { rootMargin: '400px' })
    io.observe(more.current)
    return () => io.disconnect()
  }, [browsing, all.length, results.length])
  const mine = new Set(store.settings.platforms)
  const seen = new Set(store.seen)
  const later = new Set(store.watchlist.map((w) => w.id))
  const [view, setView] = useState(readView)
  const chooseView = (v) => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // storage blocked: the choice just isn't remembered
    }
  }

  return (
    // Same width as the picks screen, whichever view is showing.
    <main className="flex min-h-full flex-1 flex-col gap-4 px-5 pt-6 pb-7 lg:px-10 lg:pt-10">
      <header className="flex items-center gap-3">
        <IconButton label="Back" onClick={() => go('pick')}><Back /></IconButton>
        <h1 className="flex-1 font-display text-[34px] leading-none tracking-[0.02em]">Search</h1>
        {/* One button: shows the view it switches to. */}
        <IconButton
          label={view === 'tiles' ? 'Switch to list view' : 'Switch to tile view'}
          onClick={() => chooseView(view === 'tiles' ? 'list' : 'tiles')}
        >
          {view === 'tiles' ? <ListIcon /> : <GridIcon />}
        </IconButton>
      </header>

      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="A film, series or show…"
          aria-label="Search titles"
          className="min-h-12 w-full rounded-2xl border border-line transition-colors hover:border-gold bg-card px-4 text-base text-ink placeholder:text-muted focus-visible:border-gold"
          style={query ? { paddingRight: '2.75rem' } : undefined}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery('')}
            className="absolute inset-y-0 right-1 flex items-center justify-center px-3 text-muted hover:text-ink"
          >
            ✕
          </button>
        )}
      </div>

      {catalog.status !== 'ready' && <p className="text-sm text-muted">Loading this week's titles…</p>}
      {browsing && catalog.status === 'ready' && (
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">This week's films &amp; series · {all.length}</p>
      )}
      {typed >= 2 && !results.length && (
        <p className="rounded-2xl border border-hair bg-card p-4 text-[15px] text-soft">
          Nothing called that in this week's list. The weekly search only knows titles people have been recommending.
        </p>
      )}

      {/* Tiles: the same cards as the picks screen. One per row on phones, three across on laptops. */}
      {view === 'tiles' && (
        <CardGrid>
          {results.map((item) => {
            // Where it streams: one the viewer has if possible, otherwise wherever it is.
            const platform = item.providers.find((p) => mine.has(p)) ?? item.providers[0]
            return (
              <TitleCard key={item.id} item={item} languages={store.settings.languages}
                badges={<>
                  {platform && <Badge>{platformName(platform)}</Badge>}
                  {vault.has(item.id) && <span className="rounded-md bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold">⭐ Vault</span>}
                </>}>
                <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                  {platform ? (
                    <OpenLink href={openUrl(item, platform)}
                      onClick={() => platform !== 'youtube' && copyTitleFor(item.name, platformName(platform))}
                      className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-2 text-sm font-semibold text-primary-ink transition-opacity hover:opacity-90">
                      Open {platformName(platform)} <External />
                    </OpenLink>
                  ) : <span />}
                  <button type="button" aria-pressed={seen.has(item.id)} onClick={() => onSeen(item.id)}
                    className={`min-h-11 rounded-xl border px-3 text-sm font-semibold backdrop-blur-md ${seen.has(item.id) ? 'border-sel bg-sel text-sel-ink' : 'border-line transition-colors hover:border-gold bg-card/50'}`}>
                    {seen.has(item.id) ? 'Seen ✓' : 'Seen it'}
                  </button>
                  <button type="button" aria-pressed={later.has(item.id)} onClick={() => onLater(item)}
                    className={`flex min-h-11 items-center gap-1 rounded-xl border px-3 text-sm font-semibold backdrop-blur-md ${later.has(item.id) ? 'border-sel bg-sel text-sel-ink' : 'border-line transition-colors hover:border-gold bg-card/50'}`}>
                    <Bookmark /> {later.has(item.id) ? 'Saved' : 'Later'}
                  </button>
                </div>
                <VaultButton vault={vault} item={item} />
              </TitleCard>
            )
          })}
        </CardGrid>
      )}

      {view === 'list' && <ul className="flex flex-col gap-2.5">
        {results.map((item) => {
          // Where it streams: one the viewer has if possible, otherwise wherever it is.
          const platform = item.providers.find((p) => mine.has(p)) ?? item.providers[0]
          return (
            <li key={item.id} className="flex gap-3 rounded-[18px] border border-hair bg-card p-3 [content-visibility:auto] [contain-intrinsic-size:140px]">
              <Poster item={item} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <h2 className="text-[16px] leading-tight font-semibold">
                  {item.name}
                  {item.year ? <span className="font-normal text-muted"> ({item.year})</span> : null}
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {platform && <Badge>{platformName(platform)}</Badge>}
                  {vault.has(item.id) && <span className="rounded-md bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold">⭐ Vault</span>}
                </div>
                <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                  {platform && (
                    <OpenLink href={openUrl(item, platform)}
                      onClick={() => platform !== 'youtube' && copyTitleFor(item.name, platformName(platform))}
                      className="flex min-h-9 items-center gap-1 rounded-lg bg-primary px-3 text-[13px] font-semibold text-primary-ink transition-opacity hover:opacity-90">
                      Open <External />
                    </OpenLink>
                  )}
                  <button type="button" aria-pressed={seen.has(item.id)} onClick={() => onSeen(item.id)}
                    className={`min-h-9 rounded-lg border px-3 text-[13px] font-semibold ${seen.has(item.id) ? 'border-sel bg-sel text-sel-ink' : 'border-line transition-colors hover:border-gold'}`}>
                    {seen.has(item.id) ? 'Seen ✓' : 'Seen it'}
                  </button>
                  <button type="button" aria-pressed={later.has(item.id)} onClick={() => onLater(item)}
                    className={`flex min-h-9 items-center gap-1 rounded-lg border px-3 text-[13px] font-semibold ${later.has(item.id) ? 'border-sel bg-sel text-sel-ink' : 'border-line transition-colors hover:border-gold'}`}>
                    <Bookmark /> {later.has(item.id) ? 'Saved' : 'Later'}
                  </button>
                  <VaultButton vault={vault} item={item} compact />
                </div>
              </div>
            </li>
          )
        })}
      </ul>}
      {/* Reaching this loads the next page while browsing. */}
      {browsing && shown < all.length && <div ref={more} className="h-10" aria-hidden="true" />}
    </main>
  )
}
