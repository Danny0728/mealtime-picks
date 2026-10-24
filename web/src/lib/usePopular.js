// Popular in the app: everyone's loves (the last known copy straight away,
// refreshed from Firestore on start), and this person's own ratings saved to
// loves/{uid} whenever they change while signed in.
import { useEffect, useMemo, useState } from 'react'
import { firebaseConfig } from './firebase-config.js'
import { cacheLoves, fetchLoves, loadCachedLoves, myRatings, withMine } from './popular.js'
import { saveLoves } from './sync.js'

const SAVED_KEY = 'mealtime-picks:loves-saved'
const SAVE_DELAY_MS = 1500

export function usePopular(user, store) {
  const [loves, setLoves] = useState(loadCachedLoves)

  useEffect(() => {
    if (!firebaseConfig?.projectId) return
    let cancelled = false
    fetchLoves(firebaseConfig.projectId)
      .then((list) => {
        if (cancelled) return
        setLoves(list)
        cacheLoves(list)
      })
      .catch(() => {}) // offline: keep the cached copy
    return () => {
      cancelled = true
    }
  }, [])

  const mine = myRatings(store)
  const key = JSON.stringify(mine)
  const uid = user?.uid

  // Save only when the list differs from what this device last saved for
  // this account, so opening the app doesn't write every time.
  useEffect(() => {
    if (!uid) return
    let last = ''
    try {
      last = localStorage.getItem(SAVED_KEY) ?? ''
    } catch {
      // storage blocked: just save again
    }
    if (last === `${uid}:${key}`) return
    const timer = setTimeout(() => {
      saveLoves(uid, mine)
        .then(() => {
          try {
            localStorage.setItem(SAVED_KEY, `${uid}:${key}`)
          } catch {
            // storage blocked: saved again next time
          }
        })
        .catch((e) => console.error('Saving loves failed:', e))
    }, SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, key])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => withMine(loves, uid, mine), [loves, uid, key])
}
