// The cinema-lobby wall behind the home screen: real TMDB posters drifting
// on a tilt, fading into the page. Purely decorative. Phones get the top
// three rows; laptops get all five and the wall fills the window.
import { WALL_PER_ROW, WALL_ROWS, wallRows } from '../lib/wall.js'
import { tints } from './ui.jsx'

const PHONE_ROWS = 3

export default function PosterWall({ posters }) {
  const rows = posters.length ? wallRows(posters, WALL_ROWS, WALL_PER_ROW) : null
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[470px] overflow-hidden lg:h-full">
      <div className="absolute -inset-x-[120px] -top-10 flex -rotate-9 flex-col gap-2.5 lg:-inset-x-[200px] lg:-top-16 lg:gap-3.5">
        {Array.from({ length: WALL_ROWS }, (_, r) => (
          <div key={r} className={`wall-row flex w-max gap-2.5 lg:gap-3.5 ${r >= PHONE_ROWS ? 'max-lg:hidden' : ''}`}>
            {/* Each row twice over, so the drift loops without a seam. */}
            {[0, 1].flatMap((copy) =>
              Array.from({ length: WALL_PER_ROW }, (_, i) => {
                const key = `${copy}-${i}`
                const size = 'h-36 w-24 shrink-0 rounded-lg lg:h-[198px] lg:w-[132px] lg:rounded-xl'
                if (!rows) {
                  const [bg] = tints[(r + i) % tints.length]
                  return <div key={key} className={`${size} opacity-70`} style={{ background: bg }} />
                }
                return <img key={key} src={rows[r][i]} alt="" loading="lazy" className={`${size} wall-poster bg-chip object-cover`} />
              }),
            )}
          </div>
        ))}
      </div>
      <div className="wall-fade absolute inset-0" />
    </div>
  )
}
