// The Vault: the owner's hand-picked must-watch list, one public Firestore
// document (public/vault) that anyone can read and only the owner can change
// (enforced by firestore.rules). Everyone reads it with one plain request,
// so signed-out users never download the Firebase SDK; the last copy is kept
// on the device for offline use.

const CACHE_KEY = 'mealtime-picks:vault'

// Firestore's REST API wraps every value in its type; unwrap to plain JS.
export function decodeValue(v) {
  if (!v || typeof v !== 'object') return undefined
  if ('stringValue' in v) return v.stringValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('booleanValue' in v) return v.booleanValue
  if ('nullValue' in v) return null
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decodeValue)
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, decodeValue(x)]))
  return undefined
}

export function decodeVault(doc) {
  const items = decodeValue(doc?.fields?.items)
  return Array.isArray(items) ? items.filter((e) => e && e.id) : []
}

// The owner check only decides which buttons show; the rules are the real lock.
export function isAdmin(user, adminUid) {
  return Boolean(adminUid) && Boolean(user?.uid) && user.uid === adminUid
}

// What the Vault keeps about a title, so it still shows if the title later
// drops out of the catalog.
export function vaultEntry(item, now) {
  const e = { id: item.id, name: item.name, poster: item.poster ?? null, year: item.year, addedAt: now }
  if (e.year === undefined) delete e.year
  return e
}

export function loadCachedVault() {
  try {
    const items = JSON.parse(localStorage.getItem(CACHE_KEY))
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

export function cacheVault(items) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(items))
  } catch {
    // Storage blocked: the Vault is just fetched again next time.
  }
}

export async function fetchVault(projectId) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/public/vault`
  const res = await fetch(url)
  if (res.status === 404) return [] // nothing added yet
  if (!res.ok) throw new Error(`vault: HTTP ${res.status}`)
  return decodeVault(await res.json())
}
