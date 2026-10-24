// The Vault in the app: the last known list straight away (from this device),
// refreshed from Firestore on start, and add/remove for the owner.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { firebaseConfig } from './firebase-config.js'
import { ADMIN_UID } from './admin-config.js'
import { cacheVault, fetchVault, isAdmin, loadCachedVault, vaultEntry } from './vault.js'
import { saveVault } from './sync.js'

export function useVault(user) {
  const [items, setItems] = useState(loadCachedVault)
  const [error, setError] = useState('')
  const admin = isAdmin(user, ADMIN_UID)

  useEffect(() => {
    if (!firebaseConfig?.projectId) return
    let cancelled = false
    fetchVault(firebaseConfig.projectId)
      .then((list) => {
        if (cancelled) return
        setItems(list)
        cacheVault(list)
      })
      .catch(() => {}) // offline: keep the cached copy
    return () => {
      cancelled = true
    }
  }, [])

  const ids = useMemo(() => items.map((e) => e.id), [items])
  const has = useCallback((id) => ids.includes(id), [ids])

  // Owner only: add or remove, shown at once, saved to Firestore; put back if the save fails.
  const toggle = useCallback(async (item) => {
    if (!admin) return
    const before = items
    const next = has(item.id) ? items.filter((e) => e.id !== item.id) : [vaultEntry(item, Date.now()), ...items]
    setItems(next)
    cacheVault(next)
    setError('')
    try {
      await saveVault(next)
    } catch (e) {
      setItems(before)
      cacheVault(before)
      console.error('Vault save failed:', e)
      setError(e?.code === 'permission-denied'
        ? "Firestore refused the save: this account isn't in the admins list (check admins/<your UID> exists in the Firebase console)."
        : `Couldn't update the Vault (${e?.code ?? e?.message ?? 'unknown error'}). Check you're online and try again.`)
    }
  }, [admin, items, has])

  return { items, ids, has, admin, toggle, error, clearError: () => setError('') }
}
