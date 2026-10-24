// Small shared pieces: chips, buttons, icons, poster.
import { useState } from 'react'

export function Chip({ on, onClick, children }) {
  // Selecting a chip pops it with a soft ripple, but only when tapped:
  // chips already selected when a screen opens stay still. (Held in state:
  // a class added straight to the element is wiped by React's next render.)
  const [popping, setPopping] = useState(false)
  const tap = (e) => {
    if (!on) setPopping(true)
    onClick?.(e)
  }
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={tap}
      onAnimationEnd={(e) => { if (e.target === e.currentTarget && e.animationName === 'chip-pop') setPopping(false) }}
      className={`relative inline-flex min-h-11 items-center justify-center rounded-full border px-4 text-[15px] font-medium transition-[background-color,border-color,color] duration-200 ${
        on ? 'border-sel bg-sel font-semibold text-sel-ink' : 'border-line bg-card text-soft'
      } ${popping ? 'chip-pop' : ''}`}
    >
      {children}
    </button>
  )
}

export function Section({ title, hint, children }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{title}</h2>
        {hint && <p className="text-[13px] text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

// `small`: a little tighter on phones, for headers with several buttons.
export function IconButton({ label, onClick, small = false, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`relative flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-card/60 text-ink backdrop-blur-md ${small ? 'max-sm:size-10' : ''}`}
    >
      {children}
    </button>
  )
}

// Small marks for where a title streams, in each service's colour (simple
// letter marks, not the services' logo artwork).
const PLATFORM_MARKS = {
  netflix: { mark: 'N', name: 'Netflix', bg: '#E50914', fg: '#fff' },
  prime: { mark: 'prime', name: 'Prime Video', bg: '#00A8E1', fg: '#fff' },
  jiohotstar: { mark: 'JH', name: 'JioHotstar', bg: '#0F1B4C', fg: '#fff' },
  sonyliv: { mark: 'LIV', name: 'SonyLIV', bg: '#111', fg: '#F2B544' },
  zee5: { mark: 'Z5', name: 'ZEE5', bg: '#6B2FA6', fg: '#fff' },
  crunchyroll: { mark: 'CR', name: 'Crunchyroll', bg: '#F47521', fg: '#fff' },
  youtube: { mark: '▶', name: 'YouTube', bg: '#FF0000', fg: '#fff' },
}

// `logos`: the services' own logos from TMDB (catalog.platformLogos), used
// when the weekly fetch has supplied them; the letter marks fill in otherwise.
export function PlatformIcons({ providers, logos }) {
  const known = (providers ?? []).filter((p) => PLATFORM_MARKS[p])
  if (!known.length) return null
  return (
    <div className="flex flex-wrap gap-1" aria-label={`On ${known.map((p) => PLATFORM_MARKS[p].name).join(', ')}`}>
      {known.map((p) => {
        const m = PLATFORM_MARKS[p]
        if (logos?.[p]) {
          return <img key={p} src={logos[p]} alt="" title={m.name} aria-hidden="true" loading="lazy" className="size-6 rounded-md object-cover" />
        }
        return (
          <span key={p} title={m.name} aria-hidden="true" style={{ background: m.bg, color: m.fg }}
            className="flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-[10px] leading-none font-extrabold tracking-tight">
            {m.mark}
          </span>
        )
      })}
    </div>
  )
}

export function Badge({ children }) {
  return <span className="rounded-md bg-chip px-2 py-0.5 text-xs font-semibold text-ink">{children}</span>
}

export const tints = [
  ['#D7E8E4', '#0B4F49'],
  ['#F5DDCF', '#8A2E07'],
  ['#E1E3F2', '#2E3478'],
  ['#EFE3C8', '#6B4A06'],
]

const posterSizes = {
  md: 'h-[104px] w-[78px]',
  lg: 'h-[138px] w-[92px] shadow-xl shadow-black/40',
  // Phones: the lg thumbnail. Laptops: full card width on top (cards sit in columns).
  card: 'h-[138px] w-[92px] shadow-xl shadow-black/40 lg:aspect-[2/3] lg:h-auto lg:w-full',
}

export function Poster({ item, count = 1, size = 'md' }) {
  const [bg, fg] = tints[hash(item.id) % tints.length]
  const dims = posterSizes[size] ?? posterSizes.md
  if (item.poster) {
    return (
      <img
        src={item.poster}
        alt=""
        loading="lazy"
        className={`${dims} shrink-0 rounded-[10px] bg-chip object-cover`}
      />
    )
  }
  return (
    <div className={`${dims} flex shrink-0 flex-col items-center justify-center gap-1 rounded-[10px]`} style={{ background: bg, color: fg }}>
      <Play size={24} />
      {count > 1 && <span className="text-xs font-bold">× {count}</span>}
    </div>
  )
}

function hash(s) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0
  return Math.abs(h)
}

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

export const Play = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="8 5 19 12 8 19" /></svg>
)
export const Sliders = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
)
export const Back = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}><path d="M15 18l-6-6 6-6" /></svg>
)
export const External = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...stroke}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
)
// Two curved arrows crossing (with a gap where they cross), pointing right.
export const Shuffle = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} strokeWidth="2.2">
    <path d="M3 7h3c4.5 0 6.5 10 11 10h3" />
    <path d="M3 17h3c2 0 3.2-1.4 4.2-3.2" />
    <path d="M13.8 10.2C14.8 8.4 16 7 18 7h2" />
    <path d="M17 4l3 3-3 3" />
    <path d="M17 14l3 3-3 3" />
  </svg>
)
export const ThumbUp = ({ down }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...stroke} style={down ? { transform: 'rotate(180deg)' } : undefined}>
    <path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3z" /><path d="M7 10l4-8a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 17.1 21H7" />
  </svg>
)
export const Pause = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}><rect x="7" y="5" width="3" height="14" rx="1" /><rect x="14" y="5" width="3" height="14" rx="1" /></svg>
)
export const Bookmark = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-5-7 5V4a1 1 0 0 1 1-1z" /></svg>
)
export const GridIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {[3, 10, 17].flatMap((y) => [3, 10, 17].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="4.5" height="4.5" rx="1" />))}
  </svg>
)
export const ListIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    {[5, 12, 19].map((y) => (
      <g key={y}>
        <circle cx="4.5" cy={y} r="1.8" fill="currentColor" />
        <path d={`M9.5 ${y}H21`} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </g>
    ))}
  </svg>
)
export const SearchIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
)
export const Lock = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
)
export const Flame = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" {...stroke}><path d="M12 22c4 0 7-2.8 7-6.8 0-3.6-2.4-6-4.2-8.2-.4 2-1.4 3.3-2.8 4C12 7.6 10.6 4.4 8 2c.2 3.4-1.6 5.6-3 7.8C4.3 11 4 12.3 4 14c0 4.6 3.6 8 8 8z" /><path d="M12 22c-1.7 0-3-1.3-3-3 0-1.8 1.4-2.8 2.2-4.4.9 1.2 3.8 2.4 3.8 4.6 0 1.6-1.3 2.8-3 2.8z" /></svg>
)
export const Inbox = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}><path d="M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5" /></svg>
)
