// Package pipeline runs one weekly pass: refresh the title pool, discover and
// read conversations on Reddit, YouTube and Instagram, extract and score
// mentions, apply the family's feedback, and write catalog.json.
package pipeline

import (
	"context"
	"crypto/sha1"
	"fmt"
	"log"
	"regexp"
	"sort"
	"strings"
	"time"

	"mealtime/fetcher/internal/config"
	"mealtime/fetcher/internal/discover"
	"mealtime/fetcher/internal/extract"
	"mealtime/fetcher/internal/instagram"
	"mealtime/fetcher/internal/model"
	"mealtime/fetcher/internal/reddit"
	"mealtime/fetcher/internal/stance"
	"mealtime/fetcher/internal/state"
	"mealtime/fetcher/internal/text"
	"mealtime/fetcher/internal/tmdb"
	"mealtime/fetcher/internal/youtube"
)

type Pipeline struct {
	Cfg      config.Config
	Secrets  config.Secrets
	State    *state.State
	Feedback *discover.Feedback
	Stance   stance.Classifier
	Now      time.Time
	Log      *log.Logger

	gaz     *extract.Gazetteer
	tmdb    *tmdb.Client
	pending []pendingComment // comments with phrases we couldn't match yet
	unknown map[string]int
	stats   Stats
}

type Stats struct {
	PoolTitles    int `json:"poolTitles"`
	Threads       int `json:"threads"`
	Comments      int `json:"comments"`
	NewMentions   int `json:"newMentions"`
	Resolved      int `json:"resolved"`
	YouTubeUnits  int `json:"youtubeUnits"`
	InstagramTags int `json:"instagramTags"`
}

type pendingComment struct {
	th model.Thread
	c  model.Comment
}

func New(cfg config.Config, sec config.Secrets, st *state.State, fb *discover.Feedback, lg *log.Logger) *Pipeline {
	return &Pipeline{
		Cfg: cfg, Secrets: sec, State: st, Feedback: fb,
		Stance: stance.Lexicon{}, Now: time.Now(), Log: lg,
		gaz: extract.NewGazetteer(), unknown: map[string]int{},
	}
}

// Run executes every source that has credentials; a failing source is logged
// and skipped so one outage never blocks the weekly catalog.
func (p *Pipeline) Run(ctx context.Context) Stats {
	langs := p.languages()
	if p.Secrets.TMDBToken != "" {
		p.tmdb = tmdb.New(p.Secrets.TMDBToken, p.Cfg.Region)
		p.step("tmdb pool", func() error { return p.refreshPool(ctx, langs) })
	} else {
		p.Log.Println("TMDB_TOKEN not set: using titles already in state")
	}
	p.buildGazetteer()
	p.step("saved shares", func() error { p.ingestSaved(); return nil })
	if p.Secrets.RedditClientID != "" && p.Secrets.RedditClientSecret != "" {
		p.step("reddit", func() error { return p.reddit(ctx, langs) })
	} else {
		p.Log.Println("Reddit credentials not set: skipping Reddit")
	}
	if p.Secrets.YouTubeKey != "" {
		p.step("youtube", func() error { return p.youtube(ctx, langs) })
	} else {
		p.Log.Println("YOUTUBE_API_KEY not set: skipping YouTube")
	}
	if p.Cfg.Instagram.Enabled && p.Secrets.InstagramToken != "" && p.Secrets.InstagramUserID != "" {
		p.step("instagram", func() error { return p.instagram(ctx) })
	}
	if p.tmdb != nil {
		p.step("resolve unknown titles", func() error { return p.resolve(ctx) })
		p.step("tmdb details", func() error { return p.enrich(ctx) })
	}
	p.applyFeedback()
	p.State.UpdatedAt = p.Now.Unix()
	return p.stats
}

func (p *Pipeline) step(name string, fn func() error) {
	start := time.Now()
	if err := fn(); err != nil {
		p.Log.Printf("%s: %v (continuing)", name, err)
		return
	}
	p.Log.Printf("%s: done in %s", name, time.Since(start).Round(time.Second))
}

func (p *Pipeline) languages() []string {
	if len(p.Feedback.Settings.Languages) > 0 {
		return p.Feedback.Settings.Languages
	}
	return p.Cfg.Languages
}

// --- TMDB pool -------------------------------------------------------------

func (p *Pipeline) refreshPool(ctx context.Context, langs []string) error {
	if err := p.tmdb.LoadGenres(ctx); err != nil {
		return err
	}
	for _, pl := range pools(p.Cfg.Budgets, langs) {
		for _, kind := range []string{"movie", "tv"} {
			ts, err := p.tmdb.Discover(ctx, kind, pl.Pool, pl.Pages)
			if err != nil {
				p.Log.Printf("discover %s/%+v: %v", kind, pl.Pool, err)
			}
			for _, t := range ts {
				p.State.Upsert(t)
			}
			p.stats.PoolTitles += len(ts)
		}
	}
	return nil
}

type poolBudget struct {
	Pool  tmdb.Pool
	Pages int
}

// pools lists what to discover: each home language, then the world's
// most-voted titles, K-dramas and anime. A pool with no budget is skipped,
// and one that a home language already covers isn't fetched twice.
func pools(b config.Budgets, langs []string) []poolBudget {
	var out []poolBudget
	home := map[string]bool{}
	for _, l := range langs {
		home[l] = true
		out = append(out, poolBudget{tmdb.Pool{Lang: l}, b.TMDBPoolPagesPerLanguage})
	}
	for _, x := range []poolBudget{
		{tmdb.Pool{}, b.WorldPoolPages},
		{tmdb.Pool{Lang: "ko"}, b.KoreanPoolPages},
		{tmdb.Pool{Lang: "ja", Genres: animationGenre}, b.AnimePoolPages},
	} {
		if x.Pages > 0 && !(x.Pool.Genres == "" && home[x.Pool.Lang]) {
			out = append(out, x)
		}
	}
	return out
}

func (p *Pipeline) buildGazetteer() {
	for _, ts := range p.State.Titles {
		p.gaz.Add(ts.Title)
	}
	p.Log.Printf("gazetteer: %d names", p.gaz.Size())
}

// --- Ingestion -------------------------------------------------------------

// ingest extracts mentions from a thread's comments, scores their stance and
// records co-mentions between titles recommended in the same thread.
func (p *Pipeline) ingest(th model.Thread, comments []model.Comment) {
	ctx := extract.Context{KindHint: extract.KindHint(th.Title), Lang: th.QueryLang}
	positive := map[string]bool{}
	hits := 0
	for _, c := range comments {
		p.stats.Comments++
		res := p.gaz.Scan(c.Text, ctx)
		for _, h := range res.Hits {
			if p.addMention(th, c, h) > 0.15 {
				positive[h.TitleID] = true
			}
			hits++
		}
		if len(res.Unknown) > 0 {
			for _, u := range res.Unknown {
				p.unknown[u]++
			}
			p.pending = append(p.pending, pendingComment{th, c})
		}
	}
	p.recordThread(th, hits, positive)
}

func (p *Pipeline) recordThread(th model.Thread, hits int, positive map[string]bool) {
	v := p.State.Venue(th.Platform, th.Venue)
	v.Threads++
	v.Hits += hits
	p.State.SeenThreads[th.Platform+":"+th.ID] = p.Now.Unix()
	p.stats.Threads++
	ids := make([]string, 0, len(positive))
	for id := range positive {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	if len(ids) > 30 {
		ids = ids[:30] // giant list threads say little about pairs
	}
	for i := 0; i < len(ids); i++ {
		for j := i + 1; j < len(ids); j++ {
			p.State.CoMentions[state.PairKey(ids[i], ids[j])]++
		}
	}
}

func (p *Pipeline) addMention(th model.Thread, c model.Comment, h extract.Hit) float64 {
	ts, ok := p.State.Titles[h.TitleID]
	if !ok {
		return 0
	}
	for _, m := range ts.Mentions {
		if m.Platform == c.Platform && m.Author == c.Author && m.ThreadID == c.ThreadID {
			return m.Stance // already counted (e.g. re-scan after resolving)
		}
	}
	st, aspects := p.Stance.Classify(h.Window, th.Title, c.TopLevel)
	ts.Mentions = append(ts.Mentions, model.Mention{
		TitleID: h.TitleID, Platform: c.Platform, Venue: c.Venue, ThreadID: c.ThreadID,
		Author: c.Author, Score: c.Score, Stance: round(st), Aspects: aspects, At: p.Now.Unix(),
	})
	if st > -0.15 {
		for _, t := range text.Terms(strings.Join(h.Window, " ")) {
			ts.Terms[t]++
		}
	}
	p.stats.NewMentions++
	return st
}

// ingestSelf treats every comment on a watchable YouTube video as an opinion
// about that video itself.
func (p *Pipeline) ingestSelf(th model.Thread, titleID string, comments []model.Comment) {
	if _, ok := p.State.Titles[titleID]; !ok {
		return
	}
	th.Title = "" // no thread prior: these comments are about the video itself
	positive := 0
	for _, c := range comments {
		p.stats.Comments++
		h := extract.Hit{TitleID: titleID, Window: text.Tokens(c.Text)}
		if p.addMention(th, c, h) > 0.15 {
			positive++
		}
	}
	p.recordThread(th, positive, nil)
}

// --- Reddit ----------------------------------------------------------------

func (p *Pipeline) reddit(ctx context.Context, langs []string) error {
	rc := reddit.New(p.Secrets.RedditClientID, p.Secrets.RedditClientSecret, p.Secrets.RedditUserAgent)
	b := p.Cfg.Budgets
	queries := discover.RedditQueries(p.Cfg.SeedQueries, p.Cfg.DiscoveryPhrases, langs, p.Feedback, p.State, b.RedditQueries, b.RedditTrustedSubSearches, p.Now)
	p.Log.Printf("reddit: %d queries", len(queries))
	for _, q := range queries {
		threads, err := rc.Search(ctx, q.Text, q.Subreddit, 25)
		if err != nil {
			p.Log.Printf("reddit search %q: %v", q.Text, err)
			continue
		}
		sort.Slice(threads, func(i, j int) bool { return threads[i].Comments > threads[j].Comments })
		taken := 0
		for _, th := range threads {
			if taken >= b.RedditThreadsPerQuery {
				break
			}
			if !discover.GoodThread(th, p.State, p.Now) {
				continue
			}
			th.QueryLang = q.Lang
			comments, err := rc.TopComments(ctx, th, 100)
			if err != nil {
				p.Log.Printf("reddit comments %s: %v", th.ID, err)
				continue
			}
			// Low-agreement comments are noise.
			var kept []model.Comment
			for _, c := range comments {
				if c.Score >= 2 {
					kept = append(kept, c)
				}
			}
			p.ingest(th, kept)
			taken++
		}
	}
	return nil
}

// --- YouTube ---------------------------------------------------------------

func (p *Pipeline) youtube(ctx context.Context, langs []string) error {
	yc := youtube.New(p.Secrets.YouTubeKey, p.Cfg.Region)
	yb := p.Cfg.YouTube
	searches := p.Cfg.Budgets.YouTubeSearches
	commentPages := p.Cfg.Budgets.YouTubeCommentPages
	defer func() { p.stats.YouTubeUnits = yc.Units }()

	// 1. Recommendation videos: their descriptions and comments mention titles.
	recQueries := append([]string{}, yb.RecommendationQueries...)
	for _, l := range langs {
		if n := discover.LangName(l); n != "" {
			recQueries = append(recQueries, "must watch "+n+" movies", "best "+n+" web series")
		}
	}
	half := searches / 2
	for i, q := range dedupeStrings(recQueries) {
		if i >= half {
			break
		}
		hits, err := yc.Search(ctx, q, "", 10)
		searches--
		if err != nil {
			p.Log.Printf("youtube search %q: %v", q, err)
			continue
		}
		for _, h := range hits {
			key := "youtube:" + h.VideoID
			if _, seen := p.State.SeenThreads[key]; seen || commentPages <= 0 {
				continue
			}
			th := model.Thread{Platform: "youtube", ID: h.VideoID, Venue: h.ChannelID, Title: h.Title, Query: q}
			comments, err := yc.Comments(ctx, h.VideoID, h.ChannelID, 100)
			commentPages--
			if err != nil {
				continue
			}
			// The creator's own list (description) is a recommendation too.
			comments = append(comments, model.Comment{Platform: "youtube", ThreadID: h.VideoID, Venue: h.ChannelID, Author: "creator:" + h.ChannelID, Text: h.Desc, Score: 20, TopLevel: true})
			p.ingest(th, comments)
		}
	}

	// 2. Watchable videos found by search (stand-up specials, documentaries).
	var ids []string
	moodOf := map[string][]string{}
	for _, q := range yb.WatchableQueries {
		if searches <= 0 {
			break
		}
		hits, err := yc.Search(ctx, q, "", 15)
		searches--
		if err != nil {
			p.Log.Printf("youtube search %q: %v", q, err)
			continue
		}
		mood := queryMood(q)
		for _, h := range hits {
			ids = append(ids, h.VideoID)
			if mood != "" {
				moodOf[h.VideoID] = []string{mood}
			}
		}
	}

	// 3. Curated channels the family trusts.
	safe := map[string]config.Channel{}
	for _, ch := range yb.CuratedChannels {
		up, err := yc.ChannelUploads(ctx, ch.ID, 25)
		if err != nil {
			p.Log.Printf("youtube channel %s: %v", ch.Name, err)
			continue
		}
		for _, id := range up {
			ids = append(ids, id)
			safe[id] = ch
		}
	}

	videos, err := yc.Videos(ctx, dedupeStrings(ids))
	if err != nil {
		p.Log.Printf("youtube videos: %v", err)
	}
	for _, v := range videos {
		if v.Adult || v.Runtime < yb.MinDurationMin || v.Runtime > yb.MaxDurationMin {
			continue
		}
		vid := strings.TrimPrefix(v.ID, "yt:")
		if ch, ok := safe[vid]; ok {
			v.ChannelSafe = ch.FamilySafe
			v.ChannelMoods = ch.Moods
		} else {
			v.ChannelMoods = moodOf[vid]
		}
		p.State.Upsert(v).DetailsAt = p.Now.Unix()
		key := "youtube:" + vid
		if _, seen := p.State.SeenThreads[key]; seen || commentPages <= 0 {
			continue
		}
		comments, err := yc.Comments(ctx, vid, "", 50)
		commentPages--
		if err != nil {
			continue
		}
		p.ingestSelf(model.Thread{Platform: "youtube", ID: vid, Venue: v.Channel, Title: v.Name}, v.ID, comments)
	}
	return nil
}

func queryMood(q string) string {
	q = strings.ToLower(q)
	switch {
	case strings.Contains(q, "stand up"), strings.Contains(q, "standup"), strings.Contains(q, "comedy"):
		return "standup"
	case strings.Contains(q, "documentary"):
		return "docu"
	case strings.Contains(q, "cricket"), strings.Contains(q, "sport"):
		return "sports"
	}
	return ""
}

// --- Instagram -------------------------------------------------------------

var hashtagRe = regexp.MustCompile(`#([\p{L}\p{N}_]{3,40})`)

func (p *Pipeline) instagram(ctx context.Context) error {
	ic := instagram.New(p.Secrets.InstagramToken, p.Secrets.InstagramUserID, p.Cfg.Instagram.GraphVersion)
	ig := &p.State.Instagram
	tags := discover.InstagramTags(p.Cfg.Instagram.CoreHashtags, p.Cfg.Instagram.RotatingSlots, p.Cfg.Budgets.InstagramHashtagsPer7d, p.State, p.Now)
	p.stats.InstagramTags = len(tags)
	seenCaption := map[string]bool{}
	for _, tag := range tags {
		if _, ok := ig.QueriedAt[tag]; !ok {
			ig.QueriedAt[tag] = p.Now.Unix()
		}
		id := ig.HashtagIDs[tag]
		if id == "" {
			var err error
			id, err = ic.HashtagID(ctx, tag)
			if err != nil || id == "" {
				p.Log.Printf("instagram #%s: %v", tag, err)
				continue
			}
			ig.HashtagIDs[tag] = id
		}
		media, err := ic.Media(ctx, tag, id)
		if err != nil {
			p.Log.Printf("instagram #%s media: %v", tag, err)
		}
		for _, m := range media {
			h := fmt.Sprintf("%x", sha1.Sum([]byte(text.Norm(m.Text))))
			if seenCaption[h] || spammy(m.Text) {
				continue // reposts and hashtag-stuffed promos
			}
			seenCaption[h] = true
			if _, seen := p.State.SeenThreads["instagram:"+m.ThreadID]; seen {
				continue
			}
			th := model.Thread{Platform: "instagram", ID: m.ThreadID, Venue: m.Venue, Title: "#" + tag + " recommend"}
			before := p.stats.NewMentions
			p.ingest(th, []model.Comment{m})
			if p.stats.NewMentions-before >= 2 {
				for _, t := range hashtagRe.FindAllStringSubmatch(m.Text, -1) {
					ig.CoTags[strings.ToLower(t[1])]++
				}
			}
		}
	}
	return nil
}

func spammy(caption string) bool {
	tags := len(hashtagRe.FindAllString(caption, -1))
	words := len(strings.Fields(caption))
	lc := strings.ToLower(caption)
	return words == 0 || float64(tags)/float64(words) > 0.6 ||
		strings.Contains(lc, "giveaway") || strings.Contains(lc, "link in bio") && tags > 15
}

// --- Household's own shares ------------------------------------------------

func (p *Pipeline) ingestSaved() {
	for i, s := range p.Feedback.Saved {
		th := model.Thread{Platform: "saved", ID: fmt.Sprintf("saved-%d", i), Venue: "household", Title: "recommend"}
		c := model.Comment{Platform: "saved", ThreadID: th.ID, Venue: "household", Author: "household", Text: s.Text, Score: 5, TopLevel: true}
		// Titles the family confirmed in the app count directly.
		for _, id := range s.IDs {
			if _, ok := p.State.Titles[id]; ok {
				p.addMention(th, c, extract.Hit{TitleID: id, Window: []string{"must", "watch"}})
			}
		}
		delete(p.State.SeenThreads, "saved:"+th.ID) // saved items are re-read every run
		p.ingest(th, []model.Comment{c})
	}
}

// --- Resolving unknown titles ---------------------------------------------

// resolve looks up phrases people bolded or listed that aren't in the pool
// yet, adds the ones TMDB knows, then re-reads the comments that had them.
func (p *Pipeline) resolve(ctx context.Context) error {
	type kv struct {
		k string
		v int
	}
	var cands []kv
	for k, v := range p.unknown {
		if _, done := p.State.Resolved[k]; !done {
			cands = append(cands, kv{k, v})
		}
	}
	sort.Slice(cands, func(i, j int) bool { return cands[i].v > cands[j].v })
	added := map[string]bool{}
	for i, c := range cands {
		if i >= p.Cfg.Budgets.TMDBSearchResolves {
			break
		}
		t, err := p.tmdb.Resolve(ctx, c.k, text.Norm)
		if err != nil {
			p.Log.Printf("resolve %q: %v", c.k, err)
			continue
		}
		if t == nil {
			p.State.Resolved[c.k] = ""
			continue
		}
		p.State.Resolved[c.k] = t.ID
		if _, exists := p.State.Titles[t.ID]; !exists {
			p.State.Upsert(*t)
			p.gaz.Add(*t)
			added[t.ID] = true
			p.stats.Resolved++
		}
	}
	if len(added) == 0 {
		return nil
	}
	for _, pc := range p.pending {
		ctx := extract.Context{KindHint: extract.KindHint(pc.th.Title), Lang: pc.th.QueryLang}
		for _, h := range p.gaz.Scan(pc.c.Text, ctx).Hits {
			if added[h.TitleID] {
				p.addMention(pc.th, pc.c, h)
			}
		}
	}
	return nil
}

// --- Details ---------------------------------------------------------------

// enrich loads providers/runtime/certification, mentioned titles first.
func (p *Pipeline) enrich(ctx context.Context) error {
	type cand struct {
		ts   *state.TitleState
		prio float64
	}
	stale := p.Now.Add(-14 * 24 * time.Hour).Unix()
	var cands []cand
	for _, ts := range p.State.Titles {
		if ts.Title.Kind == "youtube" || ts.DetailsAt > stale {
			continue
		}
		prio := float64(len(ts.Mentions))*10 + ts.Title.VoteAverage*logf(ts.Title.VoteCount)
		cands = append(cands, cand{ts, prio})
	}
	sort.Slice(cands, func(i, j int) bool { return cands[i].prio > cands[j].prio })
	n := 0
	for _, c := range cands {
		if n >= p.Cfg.Budgets.TMDBDetails {
			break
		}
		if err := p.tmdb.Enrich(ctx, &c.ts.Title); err != nil {
			p.Log.Printf("details %s: %v", c.ts.Title.ID, err)
			continue
		}
		c.ts.DetailsAt = p.Now.Unix()
		n++
	}
	p.Log.Printf("tmdb details: %d refreshed", n)
	// Keep the streaming services' logos seen while refreshing, across runs.
	for slug, url := range p.tmdb.ProviderLogos() {
		if p.State.PlatformLogos == nil {
			p.State.PlatformLogos = map[string]string{}
		}
		p.State.PlatformLogos[slug] = url
	}
	return nil
}

// --- Feedback --------------------------------------------------------------

// applyFeedback credits the communities and people whose recommendations the
// family liked (and discounts those behind 👎 / didn't finish). Each rating is
// applied once.
func (p *Pipeline) applyFeedback() {
	for _, h := range p.Feedback.History {
		if h.Feedback == "" || p.State.FeedbackApplied[h.ID] == h.Feedback {
			continue
		}
		ts, ok := p.State.Titles[h.ID]
		if !ok {
			continue
		}
		good := h.Feedback == "liked"
		for _, m := range ts.Mentions {
			if m.Stance <= 0.15 || m.Platform == "saved" {
				continue
			}
			v := p.State.Venue(m.Platform, m.Venue)
			a := p.State.Author(m.Platform, m.Author)
			if good {
				v.Liked++
				a.Liked++
			} else {
				v.Disliked++
				a.Disliked++
			}
		}
		p.State.FeedbackApplied[h.ID] = h.Feedback
	}
}

func dedupeStrings(xs []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, x := range xs {
		if x != "" && !seen[x] {
			seen[x] = true
			out = append(out, x)
		}
	}
	return out
}
