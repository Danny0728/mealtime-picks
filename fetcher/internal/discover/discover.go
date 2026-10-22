// Package discover decides what to search for each week. Nothing is limited
// to a fixed list of subreddits: queries are generated from the household's
// languages and the titles they liked, Reddit-wide search finds threads in
// any community, and communities that keep producing good picks earn extra
// targeted searches.
package discover

import (
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"math/rand"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"

	"mealtime/fetcher/internal/model"
	"mealtime/fetcher/internal/state"
)

// Feedback is the backup file the app exports (Setup → Export backup),
// committed to the repo as data/feedback.json.
type Feedback struct {
	Settings struct {
		Languages []string `json:"languages"`
		Platforms []string `json:"platforms"`
	} `json:"settings"`
	History []struct {
		ID       string `json:"id"`
		Status   string `json:"status"`
		Feedback string `json:"feedback"`
	} `json:"history"`
	Seen []string `json:"seen"`
	// "How was it?" for titles watched outside the app: liked, ok or disliked.
	SeenRatings map[string]string `json:"seenRatings"`
	Saved       []struct {
		Text string   `json:"text"`
		URL  string   `json:"url"`
		IDs  []string `json:"ids"`
	} `json:"saved"`
}

func LoadFeedback(path string) (*Feedback, error) {
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return &Feedback{}, nil
	}
	if err != nil {
		return nil, err
	}
	var f Feedback
	if err := json.Unmarshal(b, &f); err != nil {
		return nil, fmt.Errorf("feedback.json: %w", err)
	}
	return &f, nil
}

// Liked returns ids rated 👍 or "loved it" when marked seen, most recent
// last; Disliked covers 👎, "didn't finish" and "didn't like it". Seen
// ratings come first: they are usually older than the app's own picks.
func (f *Feedback) Liked() []string    { return f.with("liked") }
func (f *Feedback) Disliked() []string { return append(f.with("disliked"), f.with("unfinished")...) }

func (f *Feedback) with(v string) []string {
	var out []string
	for _, id := range f.Seen {
		if f.SeenRatings[id] == v {
			out = append(out, id)
		}
	}
	for _, h := range f.History {
		if h.Feedback == v {
			out = append(out, h.ID)
		}
	}
	return out
}

var langNames = map[string][]string{
	"mr": {"marathi"},
	"hi": {"hindi", "bollywood"},
	"en": {""},
	"ta": {"tamil"},
	"te": {"telugu"},
	"ml": {"malayalam"},
	"kn": {"kannada"},
	"bn": {"bengali"},
	"ja": {"japanese", "anime"},
	"ko": {"korean"},
}

func LangName(code string) string {
	if n, ok := langNames[code]; ok && n[0] != "" {
		return n[0]
	}
	return ""
}

// Query is one search to run, with the language it targets.
type Query struct {
	Text      string
	Lang      string
	Subreddit string // set for trusted-community searches
}

// RedditQueries builds this week's searches within the budget.
func RedditQueries(seeds, phrases, langs []string, fb *Feedback, st *state.State, budget, trustedBudget int, now time.Time) []Query {
	var pool []Query
	kinds := []string{"movies", "web series", "shows", "documentaries"}
	for _, lang := range langs {
		for _, name := range langNames[lang] {
			for _, ph := range phrases {
				for _, k := range kinds {
					pool = append(pool, Query{Text: strings.Join(strings.Fields(ph+" "+name+" "+k), " "), Lang: lang})
				}
			}
		}
	}
	// "like X" searches from what the family loved are the most personal.
	var personal []Query
	liked := fb.Liked()
	for i := len(liked) - 1; i >= 0 && len(personal) < budget/3; i-- {
		ts, ok := st.Titles[liked[i]]
		if !ok {
			continue
		}
		word := "movies"
		if ts.Title.Kind == "tv" {
			word = "shows"
		}
		personal = append(personal, Query{Text: fmt.Sprintf("%s like %s", word, ts.Title.Name), Lang: ts.Title.Lang})
	}
	for _, s := range seeds {
		pool = append(pool, Query{Text: s})
	}

	// Rotate through the generated pool week by week so every run explores
	// a different slice instead of repeating the same searches.
	week := now.Unix() / (7 * 24 * 3600)
	r := rand.New(rand.NewSource(week))
	r.Shuffle(len(pool), func(i, j int) { pool[i], pool[j] = pool[j], pool[i] })

	out := append([]Query{}, personal...)
	for _, q := range pool {
		if len(out) >= budget {
			break
		}
		out = append(out, q)
	}

	// Communities that have proven themselves get targeted searches.
	type ranked struct {
		v *state.Venue
		t float64
	}
	var venues []ranked
	for _, v := range st.Venues {
		if v.Platform == "reddit" && v.Threads >= 2 {
			venues = append(venues, ranked{v, v.Trust()})
		}
	}
	sort.Slice(venues, func(i, j int) bool { return venues[i].t > venues[j].t })
	terms := []string{"recommend", "underrated", "hidden gem", "must watch"}
	for i := 0; i < len(venues) && i < trustedBudget; i++ {
		out = append(out, Query{Text: terms[int(hash(venues[i].v.Name)+uint32(week))%len(terms)], Subreddit: venues[i].v.Name})
	}
	return dedupe(out)
}

func hash(s string) uint32 {
	h := fnv.New32a()
	h.Write([]byte(s))
	return h.Sum32()
}

func dedupe(qs []Query) []Query {
	seen := map[string]bool{}
	var out []Query
	for _, q := range qs {
		k := strings.ToLower(q.Subreddit + "|" + q.Text)
		if !seen[k] {
			seen[k] = true
			out = append(out, q)
		}
	}
	return out
}

var recTitle = regexp.MustCompile(`(?i)(recommend|suggest|underrated|hidden gem|must[- ]watch|similar|something like|like\b|best|favou?rite|what (should|to) watch|looking for|watch with|any good|overrated|worst)`)

// GoodThread is the quality gate a thread must pass before its comments are read.
func GoodThread(t model.Thread, st *state.State, now time.Time) bool {
	if t.NSFW || t.Score < 5 || t.Comments < 8 {
		return false
	}
	if _, seen := st.SeenThreads[t.Platform+":"+t.ID]; seen {
		return false
	}
	if now.Unix()-t.Created > 8*365*24*3600 { // streaming catalogues move on
		return false
	}
	return recTitle.MatchString(t.Title)
}

// InstagramTags picks this week's hashtags: the core set plus rotating tags
// that kept appearing next to good recommendation captions, never exceeding
// Meta's unique-hashtag allowance for the rolling 7-day window.
func InstagramTags(core []string, rotating, allowance int, st *state.State, now time.Time) []string {
	windowStart := now.Add(-7 * 24 * time.Hour).Unix()
	used := 0
	for tag, at := range st.Instagram.QueriedAt {
		if at < windowStart {
			delete(st.Instagram.QueriedAt, tag)
			continue
		}
		used++
	}
	inWindow := func(tag string) bool { _, ok := st.Instagram.QueriedAt[tag]; return ok }
	var out []string
	add := func(tag string) {
		tag = strings.TrimPrefix(strings.ToLower(tag), "#")
		if tag == "" {
			return
		}
		for _, t := range out {
			if t == tag {
				return
			}
		}
		// Re-querying a tag already in the window is free.
		if !inWindow(tag) {
			if used >= allowance {
				return
			}
			used++
		}
		out = append(out, tag)
	}
	for _, t := range core {
		add(t)
	}
	type kv struct {
		k string
		v int
	}
	var cands []kv
	for t, c := range st.Instagram.CoTags {
		cands = append(cands, kv{t, c})
	}
	sort.Slice(cands, func(i, j int) bool { return cands[i].v > cands[j].v })
	n := 0
	for _, c := range cands {
		if n >= rotating {
			break
		}
		before := len(out)
		add(c.k)
		if len(out) > before {
			n++
		}
	}
	return out
}
