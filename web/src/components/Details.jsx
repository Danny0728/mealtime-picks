// What a title is, on the card itself, so nobody googles it before opening.
import { Badge } from './ui.jsx'

const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 })

export function DetailBadges({ item }) {
  const genres = (item.genres ?? []).slice(0, 2).join(' · ')
  if (item.kind === 'youtube') {
    return item.views ? <div className="flex flex-wrap gap-1.5"><Badge>{compact.format(item.views)} views</Badge></div> : null
  }
  if (!item.rating && !item.cert && !genres) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {item.rating ? (
        <span className="rounded-md bg-star-bg px-2 py-0.5 text-xs font-semibold text-star" title={`${item.votes} votes on TMDB`}>
          ★ {item.rating.toFixed(1)} TMDB
        </span>
      ) : null}
      {item.cert && <Badge>{item.cert}</Badge>}
      {genres && <Badge>{genres}</Badge>}
    </div>
  )
}

export function About({ item }) {
  if (item.kind === 'youtube') {
    return item.channel ? <p className="text-[13px] text-soft">by {item.channel}</p> : null
  }
  if (!item.overview && !item.cast?.length) return null
  return (
    <div className="flex flex-col gap-1">
      {item.overview && <p className="text-[14px] leading-snug text-ink">{item.overview}</p>}
      {item.cast?.length > 0 && <p className="text-[13px] text-soft">With {item.cast.join(', ')}</p>}
    </div>
  )
}
