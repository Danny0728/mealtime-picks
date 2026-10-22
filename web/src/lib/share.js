// Reels and posts shared into the app arrive as free text. Match that text
// against catalog titles (longest match first) so the family can confirm
// what the post was recommending. Unmatched text is still saved: the weekly
// pipeline tries to resolve it on TMDB.

export function normalize(s) {
  return (s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const COMMON = new Set('up her it us dark home love life you me them time day night friends family bad good best great fan'.split(' '))

export function buildIndex(items) {
  const byName = new Map()
  for (const it of items) {
    if (it.kind === 'youtube') continue
    const key = normalize(it.name)
    if (!key) continue
    const list = byName.get(key) ?? []
    list.push(it)
    byName.set(key, list)
  }
  return byName
}

export function matchTitles(textIn, index) {
  const toks = normalize(textIn).split(' ').filter(Boolean)
  const found = []
  const seen = new Set()
  for (let i = 0; i < toks.length; i++) {
    for (let n = Math.min(6, toks.length - i); n >= 1; n--) {
      const key = toks.slice(i, i + n).join(' ')
      const cands = index.get(key)
      if (!cands) continue
      // Single common words need to look like a title in the original text.
      if (n === 1 && (key.length <= 3 || COMMON.has(key))) continue
      const best = [...cands].sort((a, b) => (b.q ?? 0) - (a.q ?? 0))[0]
      if (!seen.has(best.id)) {
        seen.add(best.id)
        found.push(best)
      }
      i += n - 1
      break
    }
  }
  return found
}

// Web Share Target delivers the shared post as URL parameters.
export function readShareParams(search) {
  const p = new URLSearchParams(search)
  const text = [p.get('share_title'), p.get('share_text')].filter(Boolean).join('\n')
  const url = p.get('share_url') ?? ''
  if (!text && !url) return null
  // Instagram often puts the link inside the text instead of the url field.
  const link = url || (text.match(/https?:\/\/\S+/)?.[0] ?? '')
  return { text: text.replace(link, '').trim(), url: link }
}
