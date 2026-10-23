// Light or dark: the phone decides unless Setup says otherwise. index.html
// applies the saved choice before first paint; this keeps it in sync after.

const COLORS = { dark: '#0A0A0E', light: '#F4EFE6' }
const DARK_QUERY = '(prefers-color-scheme: dark)'

export function resolveTheme(setting, prefersDark) {
  if (setting === 'light' || setting === 'dark') return setting
  return prefersDark ? 'dark' : 'light'
}

export function themeColor(resolved) {
  return COLORS[resolved] ?? COLORS.light
}

export function applyTheme(setting) {
  const root = document.documentElement
  const mq = typeof matchMedia === 'function' ? matchMedia(DARK_QUERY) : null
  const sync = () => {
    const resolved = resolveTheme(setting, mq?.matches ?? false)
    if (setting === 'light' || setting === 'dark') root.dataset.theme = setting
    else delete root.dataset.theme
    // Both metas, so an override beats their media queries.
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.content = themeColor(resolved)
  }
  sync()
  mq?.addEventListener?.('change', sync)
  return () => mq?.removeEventListener?.('change', sync)
}
