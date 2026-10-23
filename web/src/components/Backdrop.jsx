// Laptops only: a dimmed poster wall behind form screens (Setup, Saved finds)
// so a narrow centred panel doesn't float on a blank page.
import { useMemo } from 'react'
import { wallPosters } from '../lib/wall.js'
import PosterWall from './PosterWall.jsx'

export default function Backdrop({ catalog, store }) {
  const items = catalog.status === 'ready' ? catalog.data.items : null
  const posters = useMemo(() => wallPosters(items ?? [], store), [items, store])
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 hidden lg:block">
      <PosterWall posters={posters} />
      <div className="absolute inset-0 bg-ground/80" />
    </div>
  )
}
