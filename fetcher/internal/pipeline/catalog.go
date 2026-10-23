package pipeline

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"mealtime/fetcher/internal/score"
	"mealtime/fetcher/internal/similar"
	"mealtime/fetcher/internal/state"
)

// Item is one entry in catalog.json, shaped for the app's picker.
type Item struct {
	ID        string   `json:"id"`
	Kind      string   `json:"kind"`
	Name      string   `json:"name"`
	Year      int      `json:"year,omitempty"`
	Lang      string   `json:"lang,omitempty"`
	Runtime   int      `json:"runtime,omitempty"`
	EpMin     int      `json:"epMin,omitempty"`
	Seasons   int      `json:"seasons,omitempty"`
	Genres    []string `json:"genres,omitempty"`
	Providers []string `json:"providers"`
	Link      string   `json:"link,omitempty"`
	Poster    string   `json:"poster,omitempty"`
	Channel   string   `json:"channel,omitempty"`
	// What the card shows so nobody has to google it first.
	Overview  string             `json:"overview,omitempty"`
	Rating    float64            `json:"rating,omitempty"` // TMDB average, only with enough votes
	Votes     int                `json:"votes,omitempty"`
	Cert      string             `json:"cert,omitempty"`
	Cast      []string           `json:"cast,omitempty"`
	Views     int64              `json:"views,omitempty"` // YouTube
	Safe      bool               `json:"safe"`
	Quality   float64            `json:"q"`
	Gem       float64            `json:"gem"`
	Threads   int                `json:"threads,omitempty"`
	Platforms int                `json:"platforms,omitempty"`
	Moods     map[string]float64 `json:"moods,omitempty"`
	Aspects   map[string]float64 `json:"aspects,omitempty"`
	Similar   []string           `json:"sim,omitempty"`
	Popular   bool               `json:"popular,omitempty"`
}

type Catalog struct {
	Version     int    `json:"version"`
	GeneratedAt string `json:"generatedAt"`
	Region      string `json:"region"`
	Sample      bool   `json:"sample"`
	Attribution string `json:"attribution"`
	Stats       Stats  `json:"stats"`
	Items       []Item `json:"items"`
}

const maxItems = 3000

// A TMDB average from fewer votes than this is too noisy to show.
const minRatingVotes = 20

var unsafeCerts = map[string]bool{"A": true, "S": true, "UA 16+": true, "18+": true, "R": true, "NC-17": true, "TV-MA": true}
var riskyGenres = map[string]bool{"Horror": true, "Crime": true, "War": true, "Thriller": true}

// BuildCatalog scores every title and writes the app's catalog.
func BuildCatalog(st *state.State, stats Stats, region string, now time.Time, ytMin, ytMax int) Catalog {
	type scored struct {
		ts  *state.TitleState
		sig score.Signals
		q   float64
	}
	var keep []scored
	for _, ts := range st.Titles {
		t := ts.Title
		sig := score.Compute(ts, st)
		var q float64
		switch t.Kind {
		case "youtube":
			if t.Adult || t.Runtime < ytMin || t.Runtime > ytMax {
				continue
			}
			q = youtubeQuality(ts, sig)
		default:
			if !t.DetailsLoaded || len(t.Providers) == 0 || t.Adult {
				continue
			}
			q = sig.Quality
			if sig.Threads == 0 {
				// No community signal yet: fall back to TMDB ratings, discounted
				// so real recommendations always outrank them.
				minVotes := 50
				if t.Lang == "mr" {
					minVotes = 15
				}
				if t.VoteCount < minVotes || t.VoteAverage < 6.8 {
					continue
				}
				q = 0.6 * score.Wilson(t.VoteAverage/10*float64(t.VoteCount), float64(t.VoteCount))
			}
		}
		if sig.Against > sig.Love*1.5 && sig.Against > 2 {
			continue // the crowd actively warns against it
		}
		keep = append(keep, scored{ts, sig, q})
	}
	sort.Slice(keep, func(i, j int) bool {
		return keep[i].q+0.5*keep[i].sig.Gem > keep[j].q+0.5*keep[j].sig.Gem
	})
	if len(keep) > maxItems {
		keep = keep[:maxItems]
	}

	// Similarity and moods over the kept titles.
	docs := make([]similar.Doc, 0, len(keep))
	ids := make([]string, 0, len(keep))
	aspects := map[string]map[string]float64{}
	for _, k := range keep {
		docs = append(docs, similar.DocFor(k.ts))
		ids = append(ids, k.ts.Title.ID)
		aspects[k.ts.Title.ID] = k.sig.Aspects
	}
	ix := similar.Build(docs)
	neigh := ix.Neighbours(ids, st, 12)
	moods := ix.Moods(aspects)

	// Normalise gem to 0..1 by rank so the app's weights are comparable.
	gems := make([]float64, 0, len(keep))
	for _, k := range keep {
		gems = append(gems, k.sig.Gem)
	}
	sort.Float64s(gems)
	gemRank := func(g float64) float64 {
		if len(gems) == 0 || g <= 0 {
			return 0
		}
		i := sort.SearchFloat64s(gems, g)
		return float64(i) / float64(len(gems))
	}

	// The most-voted titles drive the "tap what you've already seen" grid.
	byVotes := append([]scored{}, keep...)
	sort.Slice(byVotes, func(i, j int) bool { return byVotes[i].ts.Title.VoteCount > byVotes[j].ts.Title.VoteCount })
	popular := map[string]bool{}
	for i := 0; i < len(byVotes) && i < 40; i++ {
		if byVotes[i].ts.Title.Kind != "youtube" {
			popular[byVotes[i].ts.Title.ID] = true
		}
	}

	cat := Catalog{
		Version:     1,
		GeneratedAt: now.UTC().Format(time.RFC3339),
		Region:      region,
		Attribution: "Title data from TMDB. Where-to-watch data from JustWatch via TMDB.",
		Stats:       stats,
	}
	for _, k := range keep {
		t := k.ts.Title
		it := Item{
			ID: t.ID, Kind: t.Kind, Name: t.Name, Year: t.Year, Lang: t.Lang,
			Runtime: t.Runtime, EpMin: t.EpisodeMin, Seasons: t.Seasons,
			Genres: t.Genres, Providers: t.Providers, Link: t.Link, Poster: t.Poster, Channel: t.Channel,
			Quality: r2(k.q), Gem: r2(gemRank(k.sig.Gem)), Threads: k.sig.Threads, Platforms: k.sig.Platforms,
			Moods: moods[t.ID], Aspects: k.sig.Aspects, Popular: popular[t.ID],
		}
		if it.Providers == nil {
			it.Providers = []string{}
		}
		if t.Kind == "youtube" {
			// YouTube descriptions are mostly links and plugs; the title says enough.
			it.Views = t.ViewCount
		} else {
			it.Overview, it.Cert, it.Cast = trimOverview(t.Overview, 300), t.Certification, t.Cast
			if t.VoteCount >= minRatingVotes {
				it.Rating, it.Votes = math.Round(t.VoteAverage*10)/10, t.VoteCount
			}
		}
		if t.Kind == "youtube" {
			if it.Moods == nil {
				it.Moods = map[string]float64{}
			}
			for _, m := range t.ChannelMoods {
				it.Moods[m] = math.Max(it.Moods[m], 0.8)
			}
		}
		it.Safe = familySafe(k.ts, k.sig)
		for _, n := range neigh[t.ID] {
			it.Similar = append(it.Similar, n.ID)
		}
		cat.Items = append(cat.Items, it)
	}
	return cat
}

func youtubeQuality(ts *state.TitleState, sig score.Signals) float64 {
	t := ts.Title
	if t.ViewCount <= 0 {
		return 0.2 * sig.Quality
	}
	likeRate := float64(t.LikeCount) / float64(t.ViewCount)
	reach := 1 - math.Exp(-float64(t.ViewCount)/50000)
	engagement := math.Min(1, likeRate/0.04) * reach
	crowd := score.Wilson(sig.Love, sig.Love+sig.Against)
	return 0.55*engagement + 0.45*crowd
}

// familySafe is conservative: anything certified adult, flagged by viewers
// as not for kids, or dark and unrated, is left out of family mode.
func familySafe(ts *state.TitleState, sig score.Signals) bool {
	t := ts.Title
	if t.Adult {
		return false
	}
	if sig.Aspects["notkids"] >= 0.1 || sig.Aspects["dark"] >= 0.3 {
		return false
	}
	if t.Kind == "youtube" {
		return t.ChannelSafe || sig.Aspects["family"] >= 0.15
	}
	if unsafeCerts[strings.ToUpper(strings.TrimSpace(t.Certification))] {
		return false
	}
	if t.Certification == "" {
		for _, g := range t.Genres {
			if riskyGenres[g] {
				return false
			}
		}
	}
	return true
}

// trimOverview keeps whole sentences up to max bytes; a first sentence that
// is already too long is cut at a word and ends with an ellipsis.
func trimOverview(s string, max int) string {
	s = strings.TrimSpace(s)
	if len(s) <= max {
		return s
	}
	head := s[:max]
	for !utf8.ValidString(head) {
		head = head[:len(head)-1]
	}
	if i := strings.LastIndexAny(head, ".!?"); i > max/3 {
		return head[:i+1]
	}
	if i := strings.LastIndexByte(head[:len(head)-len("…")], ' '); i > 0 {
		return head[:i] + "…"
	}
	return head
}

func WriteJSON(path string, v any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o644)
}

func r2(x float64) float64 { return math.Round(x*100) / 100 }

func round(x float64) float64 { return math.Round(x*100) / 100 }

func logf(n int) float64 { return math.Log1p(float64(n)) }
