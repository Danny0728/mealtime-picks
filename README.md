# Mealtime Picks

Three good things to watch for the time you have — movies, series episodes, or YouTube — chosen from what real people keep recommending, not from what everyone has already seen.

Runs entirely free: a Go pipeline in GitHub Actions does the searching once a week, and a static PWA on GitHub Pages does the picking on your phone.

```
GitHub Actions (weekly)                         GitHub Pages
┌────────────────────────────────────────┐      ┌──────────────────────────────┐
│ Go fetcher                             │      │ React PWA (installable)       │
│  TMDB      pool, India availability    │      │  setup · pick · 3 picks       │
│  Reddit    dynamic search + comments   │ ───▶ │  filters + scoring + MMR      │
│  YouTube   watchable videos + comments │ JSON │  history & feedback (local)   │
│  Instagram public hashtags (optional)  │      │  share-to-app inbox           │
│  engine    extract → stance → score    │      └──────────────────────────────┘
│            → TF-IDF + co-mentions      │
└────────────────────────────────────────┘
```

## How the search works

1. **Discovery** (`internal/discover`): queries are generated each week from your languages, discovery phrases and the titles you liked ("shows like Panchayat"). Reddit-wide search finds threads in any community; communities whose threads produce good picks earn extra targeted searches. A rotating slice of the query space is explored every week.
2. **Extraction** (`internal/extract`): comments are matched against a gazetteer of TMDB titles, longest match first. Short or common-word titles ("Up", "Dark") only count with a cue — bold, quotes, a list item, capitals or a nearby year. Same-name titles are told apart by year, movie-vs-series context and language. Bolded or listed names that match nothing are looked up on TMDB and the comment is re-read.
3. **Stance** (`internal/stance`): each mention is classified as recommending or warning against, with negation handling, a thread prior ("most overrated…" vs "recommend me…") and Hinglish/Marathi words written in Latin script. It also records aspects — funny, wholesome, slow, dark, not for kids — which feed moods and family-safety.
4. **Consensus** (`internal/score`): one vote per person per title, weighted by upvotes, community trust and the commenter's track record with your family. Quality is a Wilson lower bound times breadth across threads, boosted when several platforms agree. The **gem score** divides that love by how many people have rated it on TMDB, so the obvious titles don't dominate.
5. **Similarity & moods** (`internal/similar`): TF-IDF over what people say about each title plus its metadata, combined with co-mentions (recommended in the same threads) into a top-12 neighbour list. Mood chips are scored by TF-IDF relevance plus viewer aspects.
6. **Picking** (`web/src/lib/picker.js`): on the phone, the catalog is filtered to your platforms, languages, safety, time and what you've seen, scored with weights your 👍/👎 keep tuning, and diversified with MMR. The third slot sometimes explores. Short YouTube videos are paired to fill the slot, and a liked series comes back as "continue: episodes 3–4".

## Setup

### 1. Repo and Pages

1. Push this folder to a new GitHub repository (public repos get free Actions minutes).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Push to `main`: the *Test and deploy* workflow publishes the app with sample data.

### 2. API keys (all free; each is optional — a missing one just skips that source)

Add these under **Settings → Secrets and variables → Actions**:

| Secret | Where to get it |
|---|---|
| `TMDB_TOKEN` | themoviedb.org → Settings → API → *API Read Access Token* (v4). Needed for real data. |
| `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | reddit.com/prefs/apps → *create app* → type **script**. Check Reddit's current Data API terms; this app is non-commercial and low volume. |
| `REDDIT_USER_AGENT` | e.g. `mealtime-picks/0.1 by u/yourname` |
| `YOUTUBE_API_KEY` | Google Cloud console → enable *YouTube Data API v3* → create an API key. The weekly run uses roughly 2,000 of the free daily quota. |
| `INSTAGRAM_TOKEN`, `INSTAGRAM_USER_ID` | Only after Meta approves App Review (see below). |

Then run **Actions → Weekly fetch → Run workflow** once. After that it runs every Monday morning IST.

### 3. Install on your phone

Open the Pages URL in Chrome (Android) or Safari (iPhone) → *Add to Home Screen*. It opens full screen and works offline with last week's list.

On Android the installed app appears in the share sheet: share an Instagram reel to **Mealtime** and confirm the titles it found. On iPhone, paste the caption in *Saved finds* instead.

### 4. Let next week's search learn from you

History lives on the device. Every week or two: **Setup → Export backup**, then commit the file as `data/feedback.json`. The pipeline uses it to search for "like X" titles you loved, trust the communities and people whose picks worked for you, and look up anything you saved from Instagram.

### Instagram (optional)

Uses Meta's official Hashtag Search: an Instagram professional account, a Meta developer app, and App Review approval for *Instagram Public Content Access* and `instagram_basic`. Meta allows 30 unique hashtags per 7 days; the pipeline tracks that window in its state. Set `"enabled": true` in `fetcher/config.json` once approved. Until then, share-to-app covers the posts you find yourself.

## Run locally

```bash
# pipeline (stdlib only, Go 1.24+)
cd fetcher
go test ./...
TMDB_TOKEN=... go run ./cmd/fetcher            # writes ../web/public/catalog.json
go run ./cmd/fetcher -offline                  # rebuild the catalog from saved state

# app
cd web
npm install
npm test
npm run dev
```

Tune budgets, languages, seed queries, YouTube channels and hashtags in `fetcher/config.json`.

## Notes

- Title data from TMDB; where-to-watch data from JustWatch via TMDB (credited in the app).
- The pipeline's memory (`state.json`) is kept on the `pipeline-state` branch as a single force-pushed commit so `main` stays small.
- GitHub Pages isn't meant for commercial services; move hosting (e.g. Cloudflare Pages) if this ever becomes a paid product.
