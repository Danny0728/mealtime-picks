import { Back, Bookmark, IconButton, PlatformIcons } from '../components/ui.jsx'
import { CardGrid, TitleCard } from '../components/TitleCard.jsx'

// The owner's add/remove button. Renders nothing for everyone else.
export function VaultButton({ vault, item, compact = false }) {
  if (!vault.admin) return null
  const inVault = vault.has(item.id)
  return (
    <button
      type="button"
      aria-pressed={inVault}
      onClick={() => vault.toggle(item)}
      className={`flex items-center justify-center gap-1 border px-3 font-semibold transition-colors ${compact ? 'min-h-9 rounded-lg text-[13px]' : 'min-h-11 rounded-xl text-sm'} ${
        inVault ? 'border-gold bg-gold/15 text-gold' : 'border-line bg-card/50 backdrop-blur-md hover:border-gold'
      }`}
    >
      {inVault ? '⭐ In Vault' : '+ Vault'}
    </button>
  )
}

// The owner's hand-picked must-watch list. Everyone can browse it; only the
// owner sees Remove (and adds from Search or pick cards).
export default function Vault({ store, go, catalog, byId, vault, onLater }) {
  const logos = catalog.status === 'ready' ? catalog.data.platformLogos : null
  const later = new Set(store.watchlist.map((w) => w.id))
  const seen = new Set(store.seen)

  return (
    <main className="flex flex-1 flex-col gap-4 px-5 pt-6 pb-7 lg:px-10 lg:pt-10">
      <header className="flex items-center gap-3">
        <IconButton label="Back" onClick={() => go('pick')}><Back /></IconButton>
        <div>
          <h1 className="font-display text-[34px] leading-none tracking-[0.02em]">The Vault</h1>
          <p className="text-sm text-muted">{vault.items.length ? `${vault.items.length} hand-picked must-watch${vault.items.length > 1 ? 'es' : ''}` : 'Hand-picked must-watches'}</p>
        </div>
      </header>

      {!vault.items.length && (
        <p className="rounded-2xl border border-hair bg-card p-4 text-[15px] text-soft">
          {vault.admin ? 'Empty for now. Add titles with "+ Vault" from Search or on a pick card.' : 'Nothing here yet. Check back soon.'}
        </p>
      )}

      <CardGrid>
        {vault.items.map((entry) => {
          // The catalog has the details if the title is in it this week; the entry keeps the basics.
          const known = byId.get(entry.id)
          const item = known ?? { ...entry, providers: [] }
          return (
            <TitleCard key={entry.id} item={item} details={known} languages={store.settings.languages} watched={seen.has(entry.id)}
              badges={<span className="rounded-md bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold">⭐ Vault</span>}
              // Where it streams, for everyone; no links out, since not everyone has every service.
              extra={<PlatformIcons providers={item.providers} logos={logos} />}>
              <div className="flex flex-wrap gap-2">
                <LaterButton on={later.has(item.id)} onClick={() => onLater(item)} />
                {vault.admin && (
                  <button type="button" onClick={() => vault.toggle(item)} className="min-h-11 rounded-xl border border-line bg-card/50 px-3 text-sm font-semibold backdrop-blur-md transition-colors hover:border-gold">
                    Remove
                  </button>
                )}
              </div>
            </TitleCard>
          )
        })}
      </CardGrid>
    </main>
  )
}

// Save for later / unsave, filling the row.
export function LaterButton({ on, onClick }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl border px-3 text-sm font-semibold backdrop-blur-md transition-colors ${on ? 'border-sel bg-sel text-sel-ink' : 'border-line bg-card/50 hover:border-gold'}`}>
      <Bookmark /> {on ? 'Saved' : 'Later'}
    </button>
  )
}
