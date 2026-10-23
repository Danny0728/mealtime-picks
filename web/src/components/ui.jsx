// Small shared pieces: chips, buttons, icons, poster.

export function Chip({ on, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center justify-center rounded-full border px-4 text-[15px] font-medium transition-colors ${
        on ? 'border-sel bg-sel font-semibold text-sel-ink' : 'border-line bg-card text-soft'
      }`}
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

export function IconButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="relative flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-card/60 text-ink backdrop-blur-md"
    >
      {children}
    </button>
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

export function Poster({ item, count = 1 }) {
  const [bg, fg] = tints[hash(item.id) % tints.length]
  if (item.poster) {
    return (
      <img
        src={item.poster}
        alt=""
        loading="lazy"
        className="h-[104px] w-[78px] shrink-0 rounded-[10px] bg-chip object-cover"
      />
    )
  }
  return (
    <div className="flex h-[104px] w-[78px] shrink-0 flex-col items-center justify-center gap-1 rounded-[10px]" style={{ background: bg, color: fg }}>
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
export const Shuffle = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg>
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
export const Inbox = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}><path d="M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5" /></svg>
)
