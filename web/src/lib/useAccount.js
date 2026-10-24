// The signed-in person and their sync status, wired to the app's store.
// Does nothing (and loads no Firebase code) until firebase-config.js is set.
import { useEffect, useRef, useState } from 'react'
import { pushLocal, signIn, signOut, startSync, syncAvailable, watchAuth } from './sync.js'
import { emptyStore } from './store.js'

export function useAccount(store, setStore) {
  const available = syncAvailable()
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('synced')
  const [error, setError] = useState('')
  const [signedOut, setSignedOut] = useState(false)
  const storeRef = useRef(store)
  const fromRemote = useRef(null) // the store sync just applied: don't send it back
  storeRef.current = store

  // Firebase loads only on devices that have signed in before (the store
  // remembers its owner) or once someone taps Sign in, never just on opening.
  const [asked, setAsked] = useState(false)
  const active = available && (Boolean(store.owner) || asked)
  useEffect(() => {
    if (!active) return
    let stop = () => {}
    let cancelled = false
    watchAuth(setUser).then((unsub) => (cancelled ? unsub() : (stop = unsub)))
    return () => {
      cancelled = true
      stop()
    }
  }, [active])

  useEffect(() => {
    if (!user) return
    let stop = () => {}
    let cancelled = false
    startSync(user.uid, {
      getLocal: () => storeRef.current,
      setLocal: (s) => {
        fromRemote.current = s
        setStore(s)
      },
      onStatus: setStatus,
    }).then((fn) => (cancelled ? fn() : (stop = fn)))
    return () => {
      cancelled = true
      stop()
    }
  }, [user, setStore])

  useEffect(() => {
    if (user && store !== fromRemote.current) pushLocal(user.uid, store)
  }, [user, store])

  return {
    available,
    user,
    status,
    error,
    signedOut,
    signIn: async () => {
      setError('')
      setAsked(true)
      try {
        await signIn()
        setSignedOut(false)
      } catch (e) {
        const code = e?.code ?? ''
        if (code.includes('popup-blocked')) setError('Pop-up blocked. Allow pop-ups, or open the app in your browser to sign in.')
        else if (!code.includes('popup-closed') && !code.includes('cancelled-popup')) setError("Couldn't sign in. Try again.")
      }
    },
    signOut: async () => {
      await signOut()
      setSignedOut(true)
    },
    // For shared devices: forget the signed-out person's copy.
    clearDevice: () => {
      setStore(emptyStore())
      setSignedOut(false)
      setAsked(false)
      setUser(null)
    },
  }
}
