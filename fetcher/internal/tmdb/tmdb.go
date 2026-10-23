// Package tmdb pulls titles, India availability, runtimes and certifications
// from The Movie Database. Watch-provider data is supplied to TMDB by JustWatch
// and must be credited in the app.
package tmdb

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"mealtime/fetcher/internal/httpx"
	"mealtime/fetcher/internal/model"
)

// BaseURL is a variable so tests can point it at a fake server.
var BaseURL = "https://api.themoviedb.org/3"

type Client struct {
	http   *httpx.Client
	region string
	genres map[string]map[int]string // kind -> id -> name
}

func New(token, region string) *Client {
	h := httpx.New(60 * time.Millisecond)
	h.Headers["Authorization"] = "Bearer " + token
	h.Headers["Accept"] = "application/json"
	return &Client{http: h, region: region, genres: map[string]map[int]string{}}
}

type listItem struct {
	ID            int     `json:"id"`
	MediaType     string  `json:"media_type"`
	Title         string  `json:"title"`
	Name          string  `json:"name"`
	OriginalTitle string  `json:"original_title"`
	OriginalName  string  `json:"original_name"`
	ReleaseDate   string  `json:"release_date"`
	FirstAirDate  string  `json:"first_air_date"`
	Lang          string  `json:"original_language"`
	Overview      string  `json:"overview"`
	GenreIDs      []int   `json:"genre_ids"`
	VoteCount     int     `json:"vote_count"`
	VoteAverage   float64 `json:"vote_average"`
	Popularity    float64 `json:"popularity"`
	Poster        string  `json:"poster_path"`
	Adult         bool    `json:"adult"`
}

type listResp struct {
	Page       int        `json:"page"`
	TotalPages int        `json:"total_pages"`
	Results    []listItem `json:"results"`
}

func (c *Client) get(ctx context.Context, path string, q url.Values, out any) error {
	u := BaseURL + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	return c.http.Do(ctx, func() (*http.Request, error) { return http.NewRequest(http.MethodGet, u, nil) }, out)
}

// LoadGenres caches genre names for movie and tv.
func (c *Client) LoadGenres(ctx context.Context) error {
	for _, kind := range []string{"movie", "tv"} {
		var r struct {
			Genres []struct {
				ID   int    `json:"id"`
				Name string `json:"name"`
			} `json:"genres"`
		}
		if err := c.get(ctx, "/genre/"+kind+"/list", nil, &r); err != nil {
			return err
		}
		m := map[int]string{}
		for _, g := range r.Genres {
			m[g.ID] = g.Name
		}
		c.genres[kind] = m
	}
	return nil
}

func (c *Client) toTitle(kind string, it listItem) model.Title {
	name, orig, date := it.Title, it.OriginalTitle, it.ReleaseDate
	if kind == "tv" {
		name, orig, date = it.Name, it.OriginalName, it.FirstAirDate
	}
	t := model.Title{
		ID:          fmt.Sprintf("tmdb:%s:%d", kind, it.ID),
		Kind:        kind,
		Name:        name,
		Lang:        it.Lang,
		Overview:    it.Overview,
		VoteCount:   it.VoteCount,
		VoteAverage: it.VoteAverage,
		Popularity:  it.Popularity,
		Adult:       it.Adult,
	}
	if orig != "" && !strings.EqualFold(orig, name) {
		t.AltNames = append(t.AltNames, orig)
	}
	if len(date) >= 4 {
		t.Year, _ = strconv.Atoi(date[:4])
	}
	if it.Poster != "" {
		t.Poster = "https://image.tmdb.org/t/p/w342" + it.Poster
	}
	for _, g := range it.GenreIDs {
		if n, ok := c.genres[kind][g]; ok {
			t.Genres = append(t.Genres, n)
		}
	}
	return t
}

// Pool narrows a discover query; an empty field means any.
type Pool struct {
	Lang   string // original language, e.g. "ko"
	Genres string // TMDB genre ids, e.g. "16" for animation
}

// Discover returns titles in a pool that stream in the region, most-voted
// first. This is the gazetteer pool the extractor matches comments against.
func (c *Client) Discover(ctx context.Context, kind string, pool Pool, pages int) ([]model.Title, error) {
	var out []model.Title
	for p := 1; p <= pages; p++ {
		q := url.Values{
			"watch_region":                  {c.region},
			"with_watch_monetization_types": {"flatrate|free|ads"},
			"sort_by":                       {"vote_count.desc"},
			"include_adult":                 {"false"},
			"page":                          {strconv.Itoa(p)},
		}
		if pool.Lang != "" {
			q.Set("with_original_language", pool.Lang)
		}
		if pool.Genres != "" {
			q.Set("with_genres", pool.Genres)
		}
		var r listResp
		if err := c.get(ctx, "/discover/"+kind, q, &r); err != nil {
			return out, err
		}
		for _, it := range r.Results {
			out = append(out, c.toTitle(kind, it))
		}
		if p >= r.TotalPages {
			break
		}
	}
	return out, nil
}

// Resolve searches TMDB for a free-text candidate and returns an exact-name match.
func (c *Client) Resolve(ctx context.Context, query string, norm func(string) string) (*model.Title, error) {
	q := url.Values{"query": {query}, "include_adult": {"false"}}
	var r listResp
	if err := c.get(ctx, "/search/multi", q, &r); err != nil {
		return nil, err
	}
	want := norm(query)
	var best *model.Title
	for _, it := range r.Results {
		if it.MediaType != "movie" && it.MediaType != "tv" {
			continue
		}
		t := c.toTitle(it.MediaType, it)
		if norm(t.Name) != want && !anyNorm(t.AltNames, want, norm) {
			continue
		}
		if best == nil || t.VoteCount > best.VoteCount {
			tt := t
			best = &tt
		}
	}
	return best, nil
}

func anyNorm(names []string, want string, norm func(string) string) bool {
	for _, n := range names {
		if norm(n) == want {
			return true
		}
	}
	return false
}

type providerEntry struct {
	ProviderName string `json:"provider_name"`
}

type regionProviders struct {
	Link     string          `json:"link"`
	Flatrate []providerEntry `json:"flatrate"`
	Free     []providerEntry `json:"free"`
	Ads      []providerEntry `json:"ads"`
}

type details struct {
	Runtime        int   `json:"runtime"`
	EpisodeRunTime []int `json:"episode_run_time"`
	LastEpisode    *struct {
		Runtime int `json:"runtime"`
	} `json:"last_episode_to_air"`
	Seasons int `json:"number_of_seasons"`
	Genres  []struct {
		Name string `json:"name"`
	} `json:"genres"`
	Keywords struct {
		Keywords []struct {
			Name string `json:"name"`
		} `json:"keywords"`
		Results []struct {
			Name string `json:"name"`
		} `json:"results"`
	} `json:"keywords"`
	Providers struct {
		Results map[string]regionProviders `json:"results"`
	} `json:"watch/providers"`
	ReleaseDates struct {
		Results []struct {
			Country string `json:"iso_3166_1"`
			Dates   []struct {
				Certification string `json:"certification"`
			} `json:"release_dates"`
		} `json:"results"`
	} `json:"release_dates"`
	ContentRatings struct {
		Results []struct {
			Country string `json:"iso_3166_1"`
			Rating  string `json:"rating"`
		} `json:"results"`
	} `json:"content_ratings"`
	Credits struct {
		Cast []struct {
			Name  string `json:"name"`
			Order int    `json:"order"`
		} `json:"cast"`
	} `json:"credits"`
}

// Enrich loads runtime, keywords, region providers, certification and the
// top-billed cast into t.
func (c *Client) Enrich(ctx context.Context, t *model.Title) error {
	parts := strings.Split(t.ID, ":")
	if len(parts) != 3 || parts[0] != "tmdb" {
		return nil
	}
	kind, id := parts[1], parts[2]
	extra := "keywords,watch/providers,release_dates,credits"
	if kind == "tv" {
		extra = "keywords,watch/providers,content_ratings,credits"
	}
	var d details
	if err := c.get(ctx, "/"+kind+"/"+id, url.Values{"append_to_response": {extra}}, &d); err != nil {
		return err
	}
	t.DetailsLoaded = true
	if kind == "movie" {
		t.Runtime = d.Runtime
	} else {
		for _, r := range d.EpisodeRunTime {
			if r > 0 {
				t.EpisodeMin = r
				break
			}
		}
		if t.EpisodeMin == 0 && d.LastEpisode != nil {
			t.EpisodeMin = d.LastEpisode.Runtime
		}
		t.Seasons = d.Seasons
	}
	if len(t.Genres) == 0 {
		for _, g := range d.Genres {
			t.Genres = append(t.Genres, g.Name)
		}
	}
	t.Keywords = t.Keywords[:0]
	for _, k := range d.Keywords.Keywords {
		t.Keywords = append(t.Keywords, k.Name)
	}
	for _, k := range d.Keywords.Results {
		t.Keywords = append(t.Keywords, k.Name)
	}
	t.Providers = nil
	if rp, ok := d.Providers.Results[c.region]; ok {
		seen := map[string]bool{}
		for _, group := range [][]providerEntry{rp.Flatrate, rp.Free, rp.Ads} {
			for _, p := range group {
				s := ProviderSlug(p.ProviderName)
				if s != "" && !seen[s] {
					seen[s] = true
					t.Providers = append(t.Providers, s)
				}
			}
		}
		t.Link = rp.Link
	}
	for _, r := range d.ReleaseDates.Results {
		if r.Country == c.region {
			for _, dt := range r.Dates {
				if dt.Certification != "" {
					t.Certification = dt.Certification
				}
			}
		}
	}
	for _, r := range d.ContentRatings.Results {
		if r.Country == c.region && r.Rating != "" {
			t.Certification = r.Rating
		}
	}
	cast := d.Credits.Cast
	sort.SliceStable(cast, func(i, j int) bool { return cast[i].Order < cast[j].Order })
	t.Cast = nil
	for _, m := range cast {
		if len(t.Cast) == 3 {
			break
		}
		if m.Name != "" {
			t.Cast = append(t.Cast, m.Name)
		}
	}
	return nil
}

// ProviderSlug maps TMDB provider names to stable app slugs.
func ProviderSlug(name string) string {
	n := strings.ToLower(name)
	switch {
	case strings.Contains(n, "netflix"):
		return "netflix"
	case strings.Contains(n, "prime video"), strings.Contains(n, "amazon prime"):
		return "prime"
	case strings.Contains(n, "hotstar"):
		return "jiohotstar"
	case strings.Contains(n, "sony"):
		return "sonyliv"
	case strings.Contains(n, "zee5"):
		return "zee5"
	case strings.Contains(n, "crunchyroll"):
		return "crunchyroll"
	case strings.Contains(n, "youtube"):
		return "youtube"
	case strings.Contains(n, "mx player"):
		return "mxplayer"
	case strings.Contains(n, "apple tv"):
		return "appletv"
	}
	var b strings.Builder
	for _, r := range n {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}
