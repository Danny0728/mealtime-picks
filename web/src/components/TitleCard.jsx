// The picks screen's card for any list of titles (Search, The Vault,
// Popular): lit by its own poster, with the title's details and the
// buttons each screen passes in.
import { Poster } from './ui.jsx'
import { About, DetailBadges } from './Details.jsx'

// `details`: the catalog's entry, when the title is in this week's list
// (ratings, age and genres come from there). `badges` sit above the title,
// `extra` under it; `children` are the buttons.
export function TitleCard({ item, details = item, languages, badges, extra, children }) {
  return (
    <article className="relative isolate flex flex-col gap-3 overflow-hidden rounded-[22px] border border-hair bg-card p-3.5">
      {/* A blurred copy of the poster behind, a veil so text stays readable. */}
      {item.poster && (
        <>
          <div aria-hidden="true" className="card-glow absolute -inset-5 -z-10 bg-cover bg-center" style={{ backgroundImage: `url(${item.poster})` }} />
          <div aria-hidden="true" className="card-veil absolute inset-0 -z-10" />
        </>
      )}
      <div className="flex gap-3 lg:flex-col">
        <Poster item={item} size="card" />
        <div className="flex min-w-0 flex-col gap-1.5">
          {badges && <div className="flex flex-wrap gap-1.5">{badges}</div>}
          <h2 className="text-[19px] leading-tight font-bold">
            {item.name}
            {item.year ? <span className="font-normal text-soft"> ({item.year})</span> : null}
          </h2>
          {extra}
          {details && <DetailBadges item={details} languages={languages} />}
        </div>
      </div>
      {details && <About item={details} />}
      {/* Buttons sit at the bottom, so a row of cards lines them up. */}
      <div className="mt-auto flex flex-col gap-3">{children}</div>
    </article>
  )
}

// A wide layout's three columns of equal height; a single column on phones.
export function CardGrid({ children }) {
  return <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:gap-5">{children}</div>
}
