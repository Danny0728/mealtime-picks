// Sign in with Google and keep this device's store and the person's
// Firestore document (users/{uid}) the same. Firebase is loaded only here,
// with import(), so people who never sign in never download it. The merge
// rules live in merge.js; this file is just the wiring.
import { firebaseConfig } from './firebase-config.js'
import { adoptOnSignIn, mergeStores, pruneStore } from './merge.js'

const PUSH_DELAY_MS = 1000

let fb = null // { auth, db, mods } once loaded
let latestRemote = null
let adopted = false
let pushTimer = null
let reportStatus = () => {}

export function syncAvailable() {
  return Boolean(firebaseConfig)
}

async function load() {
  if (fb) return fb
  const [app, auth, firestore] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')])
  const instance = app.initializeApp(firebaseConfig)
  fb = {
    auth: auth.getAuth(instance),
    // Offline-first: changes queue on the device and go when it's back online.
    db: firestore.initializeFirestore(instance, {
      localCache: firestore.persistentLocalCache({ tabManager: firestore.persistentMultipleTabManager() }),
    }),
    mods: { auth, firestore },
  }
  return fb
}

const toUser = (u) => u && { uid: u.uid, name: u.displayName ?? u.email ?? 'You', photo: u.photoURL ?? null }

export async function watchAuth(cb) {
  const { auth, mods } = await load()
  return mods.auth.onAuthStateChanged(auth, (u) => cb(toUser(u)))
}

// A pop-up, not a redirect: redirects break off Firebase Hosting (GitHub
// Pages here) because browsers partition the storage they rely on.
export async function signIn() {
  const { auth, mods } = await load()
  await mods.auth.signInWithPopup(auth, new mods.auth.GoogleAuthProvider())
}

export async function signOut() {
  const { auth, mods } = await load()
  clearTimeout(pushTimer)
  await mods.auth.signOut(auth)
}

// Firestore rejects undefined values; a JSON round trip drops them.
const plain = (v) => JSON.parse(JSON.stringify(v))

export async function startSync(uid, { getLocal, setLocal, onStatus }) {
  const { db, mods } = await load()
  const { doc, onSnapshot, setDoc } = mods.firestore
  const ref = doc(db, 'users', uid)
  latestRemote = null
  adopted = false
  reportStatus = onStatus

  const write = async (store) => {
    onStatus(navigator.onLine === false ? 'offline' : 'pending')
    try {
      await setDoc(ref, plain(store))
      onStatus(navigator.onLine === false ? 'offline' : 'synced')
    } catch {
      onStatus('error') // the next change retries
    }
  }

  const stop = onSnapshot(ref, { includeMetadataChanges: true }, (snap) => {
    const { fromCache, hasPendingWrites } = snap.metadata
    if (!adopted) {
      // Only the server can say whether this account has data yet, so the
      // first merge waits for it (the device keeps working meanwhile).
      if (fromCache) return onStatus('offline')
      adopted = true
      latestRemote = snap.exists() ? snap.data() : null
      const merged = pruneStore(adoptOnSignIn(getLocal(), latestRemote, uid), Date.now())
      setLocal(merged)
      write(merged)
      return
    }
    if (!snap.exists()) return
    latestRemote = snap.data()
    if (hasPendingWrites) return onStatus('pending')
    setLocal(mergeStores(getLocal(), latestRemote))
    onStatus(fromCache ? 'offline' : 'synced')
  }, () => onStatus('error'))

  const onOnline = () => onStatus('pending')
  window.addEventListener('online', onOnline)
  return () => {
    stop()
    window.removeEventListener('online', onOnline)
    clearTimeout(pushTimer)
    adopted = false
  }
}

// Called after local changes. Always merged with the newest remote copy, so
// a device that was offline can't overwrite what changed elsewhere.
export function pushLocal(uid, store) {
  if (!fb || !adopted) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(async () => {
    const { doc, setDoc } = fb.mods.firestore
    const merged = pruneStore(latestRemote ? mergeStores(store, latestRemote) : store, Date.now())
    reportStatus(navigator.onLine === false ? 'offline' : 'pending')
    try {
      await setDoc(doc(fb.db, 'users', uid), plain(merged))
      reportStatus(navigator.onLine === false ? 'offline' : 'synced')
    } catch {
      reportStatus('error')
    }
  }, PUSH_DELAY_MS)
}
