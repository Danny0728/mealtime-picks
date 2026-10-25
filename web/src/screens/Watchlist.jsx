import { Back, Badge, External, IconButton, OpenLink, PlatformIcons } from '../components/ui.jsx'
import { CardGrid, TitleCard } from '../components/TitleCard.jsx'
import { openUrl, platformName } from './Results.jsx'
import { copyTitleFor } from '../lib/toast.js'

// "Sounds good, not tonight": the family chooses from here themselves; the
// picker leaves these out until they're watched or removed.
export default function Watchlist({ store, go, catalog, byId, onWatch, onRemove }) {
  const logos = catalog.status === 'ready' ? catalog.data.platformLogos : null
  const mine = new Set(store.settings.platforms)
  const entries = [...store.watchlist].sort((a, b) => b.at - a.at)

  return (
    <main className="flex flex-1 flex-col gap-4 px-5 pt-6 pb-7 lg:px-10 lg:pt-10">
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

      <CardGrid>
      {entries.map((w) => {
        // Out of this week's list, the entry still has its name.
        const known = byId.get(w.id)
        const item = known ?? { id: w.id, name: w.name ?? w.id, providers: [] }
        const platform = item.providers.find((x) => mine.has(x))
        const size = !known ? null : item.kind === 'tv' ? `${item.epMin || 30} min episodes` : item.runtime ? `${item.runtime} min` : null
        const remove = (
          <button type="button" onClick={() => onRemove(w.id)} className="min-h-11 rounded-xl border border-line bg-card/50 px-3 text-sm font-semibold backdrop-blur-md transition-colors hover:border-gold">
            Remove
          </button>
        )
        return (
          <TitleCard key={w.id} item={item} details={known} languages={store.settings.languages}
            badges={<>
              {platform && <Badge>{platformName(platform)}</Badge>}
              {size && <Badge>{size}</Badge>}
            </>}
            // Not on the household's services: say where it is instead of a link.
            extra={!platform && (item.providers.length
              ? <PlatformIcons providers={item.providers} logos={logos} />
              : <p className="text-sm text-muted">Not in this week's list</p>)}>
            {platform ? (
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <OpenLink
                  href={openUrl(item, platform)}
                  onClick={() => {
                    onWatch(w.id)
                    if (platform !== 'youtube') copyTitleFor(item.name, platformName(platform))
                  }}
                  className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-2 text-sm font-semibold text-primary-ink transition-opacity hover:opacity-90"
                >
                  Open {platformName(platform)} <External />
                </OpenLink>
                {remove}
              </div>
            ) : remove}
          </TitleCard>
        )
      })}
      </CardGrid>
    </main>
  )
}
