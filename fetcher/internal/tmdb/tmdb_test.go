package tmdb

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"mealtime/fetcher/internal/model"
)

// Responses trimmed from TMDB's documented shapes.
const movieDetails = `{
  "id": 550, "runtime": 139, "genres": [{"id":18,"name":"Drama"}],
  "keywords": {"keywords": [{"id":1,"name":"dual identity"}]},
  "watch/providers": {"results": {"IN": {"link": "https://www.themoviedb.org/movie/550/watch?locale=IN",
     "flatrate": [{"provider_id": 8, "provider_name": "Netflix", "logo_path": "/netflix.jpg"}, {"provider_id": 1796, "provider_name": "Netflix basic with Ads", "logo_path": "/netflix-ads.jpg"}],
     "ads": [{"provider_id": 2336, "provider_name": "JioHotstar"}]}}},
  "release_dates": {"results": [{"iso_3166_1": "IN", "release_dates": [{"certification": "A"}]}]},
  "credits": {"cast": [{"name": "Edward Norton", "order": 0}, {"name": "Brad Pitt", "order": 1},
     {"name": "Helena Bonham Carter", "order": 2}, {"name": "Meat Loaf", "order": 3}]}
}`

const tvDetails = `{
  "id": 1, "episode_run_time": [], "last_episode_to_air": {"runtime": 34}, "number_of_seasons": 3,
  "genres": [{"id":35,"name":"Comedy"}],
  "keywords": {"results": [{"id":2,"name":"village"}]},
  "watch/providers": {"results": {"IN": {"flatrate": [{"provider_id": 119, "provider_name": "Amazon Prime Video"}]}}},
  "content_ratings": {"results": [{"iso_3166_1": "IN", "rating": "UA 13+"}]}
}`

func TestDiscoverPools(t *testing.T) {
	var got []url.Values
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = append(got, r.URL.Query())
		w.Write([]byte(`{"page":1,"total_pages":1,"results":[{"id":7,"name":"Death's Game","original_language":"ko"}]}`))
	}))
	defer srv.Close()
	BaseURL = srv.URL
	c := New("tok", "IN")

	if _, err := c.Discover(context.Background(), "tv", Pool{}, 1); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Discover(context.Background(), "tv", Pool{Lang: "ja", Genres: "16"}, 1); err != nil {
		t.Fatal(err)
	}
	if world := got[0]; world.Has("with_original_language") || world.Has("with_genres") || world.Get("watch_region") != "IN" {
		t.Errorf("the world pool should be any language streaming in the region: %v", world)
	}
	if anime := got[1]; anime.Get("with_original_language") != "ja" || anime.Get("with_genres") != "16" {
		t.Errorf("the anime pool should be Japanese animation: %v", anime)
	}
}

func TestEnrich(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok" {
			w.WriteHeader(401)
			return
		}
		switch {
		case strings.HasPrefix(r.URL.Path, "/movie/550"):
			w.Write([]byte(movieDetails))
		case strings.HasPrefix(r.URL.Path, "/tv/1"):
			w.Write([]byte(tvDetails))
		default:
			w.WriteHeader(404)
		}
	}))
	defer srv.Close()
	BaseURL = srv.URL
	c := New("tok", "IN")

	m := model.Title{ID: "tmdb:movie:550", Kind: "movie"}
	if err := c.Enrich(context.Background(), &m); err != nil {
		t.Fatal(err)
	}
	if m.Runtime != 139 || m.Certification != "A" || strings.Join(m.Providers, ",") != "netflix,jiohotstar" || len(m.Keywords) != 1 {
		t.Fatalf("movie: %+v", m)
	}
	if got := strings.Join(m.Cast, ", "); got != "Edward Norton, Brad Pitt, Helena Bonham Carter" {
		t.Errorf("cast should be the top three billed, got %q", got)
	}
	// The service's own TMDB logo, the first one seen for that service.
	if got := c.ProviderLogos()["netflix"]; got != "https://image.tmdb.org/t/p/w92/netflix.jpg" {
		t.Errorf("netflix logo = %q", got)
	}

	tv := model.Title{ID: "tmdb:tv:1", Kind: "tv"}
	if err := c.Enrich(context.Background(), &tv); err != nil {
		t.Fatal(err)
	}
	if tv.EpisodeMin != 34 || tv.Seasons != 3 || tv.Providers[0] != "prime" || tv.Certification != "UA 13+" || tv.Keywords[0] != "village" {
		t.Fatalf("tv: %+v", tv)
	}
}

func TestLoadProviderLogos(t *testing.T) {
	var paths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path+"?"+r.URL.RawQuery)
		if strings.HasSuffix(r.URL.Path, "/tv") {
			w.Write([]byte(`{"results":[
			  {"provider_name":"Crunchyroll","logo_path":"/cr.jpg","display_priorities":{"IN":5}},
			  {"provider_name":"Sony Liv","logo_path":"/sony.jpg","display_priorities":{"IN":9}}]}`))
			return
		}
		w.Write([]byte(`{"results":[
		  {"provider_name":"Netflix basic with Ads","logo_path":"/netflix-ads.jpg","display_priorities":{"IN":40}},
		  {"provider_name":"Netflix","logo_path":"/netflix.jpg","display_priorities":{"IN":2}},
		  {"provider_name":"Some Service","logo_path":""}]}`))
	}))
	defer srv.Close()
	BaseURL = srv.URL
	c := New("tok", "IN")

	if err := c.LoadProviderLogos(context.Background()); err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"netflix":     "https://image.tmdb.org/t/p/w92/netflix.jpg", // the main brand, not the ads tier
		"crunchyroll": "https://image.tmdb.org/t/p/w92/cr.jpg",
		"sonyliv":     "https://image.tmdb.org/t/p/w92/sony.jpg",
	}
	got := c.ProviderLogos()
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s logo = %q, want %q", k, got[k], v)
		}
	}
	if _, ok := got["someservice"]; ok {
		t.Error("a service without a logo should be skipped")
	}
	if len(paths) != 2 || !strings.Contains(paths[0], "watch_region=IN") {
		t.Errorf("should ask for movie and tv services in the region: %v", paths)
	}
}
