// What a title is, on the card itself, so nobody googles it before opening.
import { useEffect, useRef, useState } from 'react'
import { Badge } from './ui.jsx'

const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 })

// "Korean", "Japanese"… from the browser, falling back to the code.
function languageName(code) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

// `languages` are the household's; anything else is flagged as subtitled.
export function DetailBadges({ item, languages }) {
  const genres = (item.genres ?? []).slice(0, 2).join(' · ')
  if (item.kind === 'youtube') {
    return item.views ? <div className="flex flex-wrap gap-1.5"><Badge>{compact.format(item.views)} views</Badge></div> : null
  }
  const subtitled = languages && item.lang && !languages.includes(item.lang)
  if (!item.rating && !item.cert && !genres && !subtitled) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {subtitled && <Badge>{languageName(item.lang)} · subtitles</Badge>}
      {item.rating ? (
        <span className="rounded-md bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold" title={`${item.votes} votes on TMDB`}>
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
      {item.overview && <Overview text={item.overview} />}
      {item.cast?.length > 0 && <p className="text-[13px] text-soft">With {item.cast.join(', ')}</p>}
    </div>
  )
}

// Three lines, so cards line up; a long one opens in place when tapped.
function Overview({ text }) {
  const ref = useRef(null)
  const [open, setOpen] = useState(false)
  const [long, setLong] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || open) return
    const check = () => setLong(el.scrollHeight > el.clientHeight + 1)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [open, text])
  const cls = `text-[14px] leading-snug text-ink ${open ? '' : 'line-clamp-3'}`
  if (!long && !open) return <p ref={ref} className={cls}>{text}</p>
  return (
    <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex flex-col items-start gap-0.5 text-left">
      <span ref={ref} className={cls}>{text}</span>
      <span className="text-[13px] font-semibold text-gold">{open ? 'less' : 'more'}</span>
    </button>
  )
}
