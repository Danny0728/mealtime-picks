// The cinema-lobby wall behind the home screen: real TMDB posters drifting
// on a tilt, fading into the page. Purely decorative.
import { wallRows } from '../lib/wall.js'
import { tints } from './ui.jsx'

const ROWS = 3
const PER_ROW = 8

export default function PosterWall({ posters }) {
  const rows = posters.length ? wallRows(posters, ROWS, PER_ROW) : null
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[470px] overflow-hidden">
      <div className="absolute -inset-x-[120px] -top-10 flex -rotate-9 flex-col gap-2.5">
        {Array.from({ length: ROWS }, (_, r) => (
          <div key={r} className="wall-row flex w-max gap-2.5">
            {/* Each row twice over, so the drift loops without a seam. */}
            {[0, 1].flatMap((copy) =>
              Array.from({ length: PER_ROW }, (_, i) => {
                const key = `${copy}-${i}`
                if (!rows) {
                  const [bg] = tints[(r + i) % tints.length]
                  return <div key={key} className="h-36 w-24 shrink-0 rounded-lg opacity-70" style={{ background: bg }} />
                }
                return <img key={key} src={rows[r][i]} alt="" loading="lazy" className="h-36 w-24 shrink-0 rounded-lg bg-chip object-cover wall-poster" />
              }),
            )}
          </div>
        ))}
      </div>
      <div className="wall-fade absolute inset-0" />
    </div>
  )
}
