// The Firebase web app's config, injected at build time: GitHub Actions
// secrets in the deploy workflow, web/.env.local for local dev (git-ignored).
// It isn't truly secret (it ships inside the app's JavaScript); the Firestore
// rules in firestore.rules are what keep each person's data private.
// Without it, sign-in is hidden and the app works on this device only.
const env = import.meta.env ?? {}

export const firebaseConfig = env.VITE_FIREBASE_API_KEY
  ? {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    }
  : null
