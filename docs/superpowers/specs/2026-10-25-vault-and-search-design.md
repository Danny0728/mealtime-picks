# The Vault and catalog search

## Why

The owner wants a hand-picked must-watch list, **the Vault**, that every user can see and that only the owner can change. Picks are three random titles per round, so the owner also needs a way to find any title to add it: **catalog search**. Search is useful to everyone for finding a specific title.

## Goals

- **Only the owner can change the Vault:** only the owner's account can add titles to it or remove them. Firestore security rules enforce this, not just the UI.
- **Everyone can read it, signed in or not.**
- **It shows in three places:**
  - its own **Vault** screen, opened from a 🔒 button on the home screen;
  - **everyone's picks**, where Vault titles get a small boost and a "⭐ From the Vault" badge;
  - **for the owner only**, an **Add to vault** / **Remove from vault** button on pick cards, search results and the Vault screen.
- **Search** across this week's catalog by title, for everyone. Each result offers Open, Seen it and Later, plus the Vault button for the owner.

## Non-goals

- "Popular with other users". That's the next project; it will build on the public-document pattern set up here.
- Searching TMDB directly. That needs the TMDB key in the app, where anyone could read it. Search covers the catalog only.
- More than one admin, or any admin screens beyond the buttons described here.

## Anti-goals

- **The owner's email anywhere in the repo or the app.** Identify the owner by their Firebase user ID only.
- **Downloading the Firebase SDK just to read the Vault.** Signed-out users read it with one plain `fetch`.
- **A Vault entry vanishing because its title left the catalog.** Entries store their own name and poster.

## Decided

**Data**
- One public Firestore document: `public/vault` = `{ items: [{ id, name, poster, year, addedAt }] }`, newest first.
- Rules, added to `firestore.rules`. The admin list lives in the database, so the rules hold no UID and the repo copy is exactly what's live:
  ```
  match /public/vault {
    allow read: if true;
    allow write: if request.auth != null
      && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
  }
  match /admins/{uid} {
    allow read, write: if false; // managed in the Firebase console only
  }
  ```
- **Admins:** each admin is one document `admins/<their User UID>` (any or no fields), created by hand in the Firebase console. Adding another admin later needs no rule change.
- **Search is owner-only too** (the owner's call): only the owner sees the Search button, and the search route sends anyone else to the home screen.

**Who is the owner**
- **In the app:** a signed-in user whose `uid` equals the build-time variable `VITE_ADMIN_UID` sees the owner buttons. It's a GitHub secret `ADMIN_UID` for the deploy, and `web/.env.local` locally.
- **The real protection** is the Firestore rule. The app's check only hides buttons.

**Reading the Vault**
- **Request:** `GET https://firestore.googleapis.com/v1/projects/<projectId>/databases/(default)/documents/public/vault`, decoding Firestore's REST value format into plain objects.
- **When:** on app start, cached in `localStorage`. Pick cards and the Vault screen use the cached copy straight away, so it works offline with the last known list.
- **The owner's own updates:** when the owner changes the Vault, the app updates its copy at once and writes through the Firebase SDK (already loaded, since the owner is signed in).

**In picks**
- Vault titles still pass every normal filter: platforms, language, age rating, seen, watchlist.
- When one is a candidate, its score gets **+0.06**, and its reason becomes "⭐ From the Vault: hand-picked must-watch."

**Search**
- **Where:** a 🔍 button on the home screen opens a Search screen.
- **Matching:** case-insensitive on `name` and `altNames`. Prefix matches rank above substring matches, then by quality `q`. At most 30 results, starting from 2 typed characters.
- **Results:** poster, title, year and platform badges. Buttons: Open (if it's on one of your platforms), Seen it, Later, and the owner's Vault toggle.

## Testing

- **Unit tests:**
  - the Firestore REST decoder;
  - `searchCatalog(items, query)`: prefix beats substring, `altNames` match, under 2 characters gives nothing, the cap at 30;
  - `isAdmin(user, adminUid)`;
  - picker: a Vault title gets the boost and the reason, and still respects every filter.
- **Manual:**
  - signed out: the Vault shows, with no owner buttons and no Firebase download;
  - as the owner: add from search and from a card, remove from the Vault screen, and see it appear on a second device;
  - as a different Google account: no owner buttons, and a forced write is rejected by the rules.

## Owner setup

1. **Sign in:** sign in to the app once with Google, so the account exists.
2. **Copy your ID:** Firebase console → Authentication → Users → copy your **User UID**.
3. **Store it:** add it as the GitHub secret `ADMIN_UID`, and to `web/.env.local` as `VITE_ADMIN_UID=...`.
4. **Rules:** paste `firestore.rules` into Firestore → Rules → Publish. It contains no UID.
5. **Admin document:** in Firestore → Data, start a collection `admins` with one document whose **Document ID is your User UID**, with any field (e.g. `name: "owner"`).

## Left to the builder

- Vault screen layout, reusing the Watchlist card style.
- Debounce on the search input.
