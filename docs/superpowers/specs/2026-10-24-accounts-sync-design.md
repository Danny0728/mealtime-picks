# Accounts and sync

## Why

Everything the app remembers (seen titles, ratings, watchlist, saved finds, settings, history) lives in `localStorage` on one device. The owner uses two devices and is tired of marking the same titles as seen on both. Friends in other homes use the app too, separately. Each person should sign in and find their own data on every device.

## Goals

- Sign in with Google. One tap, no passwords stored by us.
- Each person's data is the same on every device they sign in on, within a few seconds when both are online.
- Separate people get separate, private data. Nobody can read or change anyone else's.
- Nothing already on a device is lost when its owner first signs in. Data from every device they've used ends up in their account.

## Non-goals

- Shared households (several people editing one list). Each account is one person's.
- The weekly fetch reading accounts. It keeps learning from the hand-exported `data/feedback.json` for now.
- Any server of our own. The app stays a static PWA on GitHub Pages.
- Other sign-in methods (email or password, phone).

## Anti-goals

- **Sign-in becomes required.** Without signing in, the app must work exactly as today (this device only).
- **Losing data in a merge.** A device that was offline for days must not wipe out newer changes made on another device.
- **A slower app for people who don't sign in.** The Firebase library is not part of the first load for signed-out users.
- **A cost.** Everything stays inside Firebase's free Spark plan.

## Decided

- **Platform:** Firebase on the owner's Google Cloud account (the owner asked for GCP).
  - **Firebase Authentication:** the Google provider.
  - **Cloud Firestore:** in `asia-south1`.
- **Data model:** one document per person at `users/{uid}`, holding the synced parts of the store.
- **Security rules:** checked into the repo as `firestore.rules`, and pasted into the console by the owner:
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /users/{uid} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
  ```
- **Firebase web config:** committed to the repo in `web/src/lib/firebase-config.js`. It's public by design, because the rules protect the data, not the key. Authorized domains are the Pages domain plus `localhost`.
- **Unchanged:** the local store stays the app's working copy, and `localStorage` keeps working offline and when signed out. Sync copies it to and from Firestore.

## Merging (the important part)

Signing in, opening the app, and every change arriving from another device all go through one **pure** function: `mergeStores(a, b) → merged`. It must be order-independent (`merge(a, b)` gives the same result as `merge(b, a)`), and merging a store with itself must change nothing. Then two devices converge no matter who syncs first.

- **Seen titles, watchlist entries, seen ratings and saved finds** are per item, with a timestamp. Removals are recorded as **tombstones**: a record that the id was removed at time T. For each id, the newest event wins, whether it's an add, a change or a removal. Un-marking "seen" on one device therefore removes it everywhere, and an old device can't bring it back.
- **History entries** are combined, keyed by `id + at + status`. If the same entry exists on both sides, the one with feedback beats the one without, and the later feedback wins.
- **Settings, `lastAsk` and `weights`** are each a whole object with an `updatedAt`. The newer one wins.
- **Tombstones** older than 90 days can be dropped, and history keeps its current cap of 1000 entries. Together they keep the document well under Firestore's 1 MB limit.

To do this the store needs timestamps it doesn't have today: when each seen id, rating and saved find was last changed, and `updatedAt` on settings, `lastAsk` and `weights`. Older stores are normalised by treating missing timestamps as 0, so anything with a real timestamp wins.

## Sync behaviour

- **Signed out:** exactly today's behaviour. The Firebase SDK isn't loaded at all (dynamic `import()`).
- **Signing in (Setup → "Sign in with Google"):** read `users/{uid}`, merge it with the local store, write the result to both. Then subscribe to the document, merging every remote change into the local store.
- **Local changes:** written to Firestore shortly after they happen (debounced, about 1 second), always as `merge(remote, local)` so a stale device can't overwrite newer data.
- **Offline:** use Firestore's offline persistence, so writes queue and send when back online. On reconnect, the snapshot listener delivers the latest remote copy, which goes through the merge.
- **Remembered sign-in:** Firebase keeps the session on that device until the person signs out.
- **Signing out:** stop syncing. The device keeps its local copy, which is that person's data. A small note says so, with a "Clear this device" button for shared devices.
- **Status in Setup:** shows "Signed in as <name> · synced" or "… · offline, will sync". On failure it shows "Couldn't sync, retrying", and the app keeps working locally.

## Constraints and known traps

- **Use `signInWithPopup`, not `signInWithRedirect`.** The redirect flow breaks for apps not served from Firebase Hosting (GitHub Pages here), because browsers partition the third-party storage it relies on. *(builder's call)*
- **iPhone home-screen installs** are the riskiest place for the pop-up. The manual check must include one. If the pop-up is blocked there, show "Open in Safari to sign in": the session then carries over the next time the installed app is opened in Safari, though not into the standalone app itself, which keeps its own storage. Record what actually happens.
- **The service worker** already caches built JS. The lazy-loaded Firebase chunk is cached the same way after first use. Firestore traffic must never be cached by the service worker.
- **App size:** the Firebase SDK adds roughly 100 KB gzipped, but only to the lazy chunk.

## UI

- **Setup:** a new "Your account" section at the top.
  - Signed out: **Sign in with Google** and one line: "Keeps your seen list, ratings and watchlist the same on all your devices."
  - Signed in: avatar, name, sync status, and a **Sign out** button.
- **Home:** a small avatar on the Setup icon button when signed in. Nothing else changes.

## Owner setup (one-off, Firebase console)

1. **Create the project:** create (or pick) a project. Analytics is off.
2. **Turn on Google sign-in:** Authentication → Sign-in method → Google → Enable. Under Settings → Authorized domains, add `<user>.github.io`.
3. **Create the database:** Firestore → Create database → `asia-south1` → production mode. Then paste `firestore.rules` into the Rules tab and click Publish.
4. **Register the web app and share the config:** Project settings → Your apps → Web → register `mealtime-web` (no Firebase Hosting). Copy the `firebaseConfig` into `web/src/lib/firebase-config.js`.

## Testing

- **Unit tests for `mergeStores`:**
  - Order-independent, and merging a store with itself changes nothing.
  - Newest wins per item, and a tombstone beats an older add.
  - An old offline device can't resurrect a removed seen id.
  - History entries are combined, with feedback beating no feedback.
  - Settings use last-write-wins.
  - Old stores without timestamps merge without losing anything.
- **Unit test that timestamps are recorded:** marking seen, un-marking, rating and watchlist changes each record a timestamp or tombstone.
- **Manual check:**
  - Sign in on two browsers, then mark, un-mark and rate on each and watch the other update.
  - Go offline on one, change things, come back, and check both converge.
  - Sign out and check the app still works.
  - Load signed out and check the network panel shows no Firebase files.

## Left to the builder

- Exact shape of timestamps and tombstones in the store, as long as the merge rules above hold.
- File layout (suggested: `lib/merge.js` pure, `lib/sync.js` for Firebase wiring, `lib/firebase-config.js`).
- Debounce interval and retry backoff.
- Whether the merge runs on the whole store or only on the synced fields. Purely local fields (none today) would stay out of the document.
