import { useMemo } from 'react'
import { Back, IconButton, PlatformIcons } from '../components/ui.jsx'
import { CardGrid, TitleCard } from '../components/TitleCard.jsx'
import { popularList } from '../lib/popular.js'
import { LaterButton, VaultButton } from './Vault.jsx'

// What people using the app loved, surest bets first: loves out of
// everyone who rated it, scored so a handful of votes can't top many.
export default function Popular({ store, go, catalog, vault, loves, onLater }) {
  const ready = catalog.status === 'ready'
  const list = useMemo(() => (ready ? popularList(loves, catalog.data.items) : []), [ready, catalog, loves])
  const logos = ready ? catalog.data.platformLogos : null
  const later = new Set(store.watchlist.map((w) => w.id))
  const seen = new Set(store.seen)

  return (
    <main className="flex flex-1 flex-col gap-4 px-5 pt-6 pb-7 lg:px-10 lg:pt-10">
      <header className="flex items-center gap-3">
        <IconButton label="Back" onClick={() => go('pick')}><Back /></IconButton>
        <div>
          <h1 className="font-display text-[34px] leading-none tracking-[0.02em]">Popular</h1>
          <p className="text-sm text-muted">Loved by people here, surest bets first</p>
        </div>
      </header>

      {!ready && <p className="text-sm text-muted">Loading this week's titles…</p>}
      {ready && !list.length && (
        <p className="rounded-2xl border border-hair bg-card p-4 text-[15px] text-soft">
          Nothing loved yet. When people rate a pick <span className="font-semibold">Loved it</span>, it shows up here.
        </p>
      )}

      <CardGrid>
        {list.map(({ item, loves: n, rated }) => (
          <TitleCard key={item.id} item={item} languages={store.settings.languages} watched={seen.has(item.id)}
            badges={<span className="rounded-md bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold">♥ {rated > n ? `${n} of ${rated}` : n} loved it</span>}
            // Where it streams, like the Vault: no links out.
            extra={<PlatformIcons providers={item.providers} logos={logos} />}>
            <div className="flex flex-wrap gap-2">
              <LaterButton on={later.has(item.id)} onClick={() => onLater(item)} />
              <VaultButton vault={vault} item={item} />
            </div>
          </TitleCard>
        ))}
      </CardGrid>
    </main>
  )
}
