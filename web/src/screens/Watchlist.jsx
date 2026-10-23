import { Back, Badge, External, IconButton, Poster } from '../components/ui.jsx'
import { About, DetailBadges } from '../components/Details.jsx'
import { openUrl, platformName } from './Results.jsx'

// "Sounds good, not tonight": the family chooses from here themselves; the
// picker leaves these out until they're watched or removed.
export default function Watchlist({ store, go, byId, onWatch, onRemove }) {
  const mine = new Set(store.settings.platforms)
  const entries = [...store.watchlist].sort((a, b) => b.at - a.at)

  return (
    <main className="flex flex-1 flex-col gap-4 px-5 pt-6 pb-7">
      <header className="flex items-center gap-3">
        <IconButton label="Back" onClick={() => go('pick')}><Back /></IconButton>
        <div>
          <h1 className="font-display text-[34px] leading-none tracking-[0.02em]">Watchlist</h1>
          <p className="text-sm text-muted">{entries.length ? `${entries.length} saved for later` : 'Nothing saved yet'}</p>
        </div>
      </header>

      {!entries.length && (
        <p className="rounded-2xl border border-hair bg-card p-4 text-[15px] text-soft">
          Tap <span className="font-semibold">Later</span> on a pick that sounds good but isn't for tonight. It waits here and stays out of your picks.
        </p>
      )}

      {entries.map((w) => {
        const item = byId.get(w.id)
        const platform = item?.providers.find((x) => mine.has(x))
        if (!item || !platform) {
          return (
            <article key={w.id} className="flex items-center justify-between gap-3 rounded-[18px] border border-hair bg-card p-3 opacity-60">
              <div className="min-w-0">
                <h2 className="truncate text-[17px] leading-tight font-semibold">{item?.name ?? w.name ?? w.id}</h2>
                <p className="text-sm text-muted">Not on your platforms right now</p>
              </div>
              <button type="button" onClick={() => onRemove(w.id)} className="min-h-11 shrink-0 rounded-xl border border-line px-3 text-sm font-semibold">
                Remove
              </button>
            </article>
          )
        }
        const size = item.kind === 'tv' ? `${item.epMin || 30} min episodes` : item.runtime ? `${item.runtime} min` : null
        return (
          <article key={w.id} className="flex flex-col gap-3 rounded-[18px] border border-hair bg-card p-3">
            <div className="flex gap-3">
              <Poster item={item} size="lg" />
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap gap-1.5">
                  <Badge>{platformName(platform)}</Badge>
                  {size && <Badge>{size}</Badge>}
                </div>
                <h2 className="text-[17px] leading-tight font-semibold">
                  {item.name}
                  {item.year ? <span className="font-normal text-muted"> ({item.year})</span> : null}
                </h2>
                <DetailBadges item={item} />
              </div>
            </div>
            <About item={item} />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <a
                href={openUrl(item, platform)}
                target="_blank"
                rel="noreferrer"
                onClick={() => onWatch(w.id)}
                className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-2 text-sm font-semibold text-primary-ink"
              >
                Open {platformName(platform)} <External />
              </a>
              <button type="button" onClick={() => onRemove(w.id)} className="min-h-11 rounded-xl border border-line bg-card/50 px-3 text-sm font-semibold backdrop-blur-md">
                Remove
              </button>
            </div>
          </article>
        )
      })}
    </main>
  )
}
