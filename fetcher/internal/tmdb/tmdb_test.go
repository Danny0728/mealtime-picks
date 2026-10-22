package tmdb

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"mealtime/fetcher/internal/model"
)

// Responses trimmed from TMDB's documented shapes.
const movieDetails = `{
  "id": 550, "runtime": 139, "genres": [{"id":18,"name":"Drama"}],
  "keywords": {"keywords": [{"id":1,"name":"dual identity"}]},
  "watch/providers": {"results": {"IN": {"link": "https://www.themoviedb.org/movie/550/watch?locale=IN",
     "flatrate": [{"provider_id": 8, "provider_name": "Netflix"}, {"provider_id": 1796, "provider_name": "Netflix basic with Ads"}],
     "ads": [{"provider_id": 2336, "provider_name": "JioHotstar"}]}}},
  "release_dates": {"results": [{"iso_3166_1": "IN", "release_dates": [{"certification": "A"}]}]}
}`

const tvDetails = `{
  "id": 1, "episode_run_time": [], "last_episode_to_air": {"runtime": 34}, "number_of_seasons": 3,
  "genres": [{"id":35,"name":"Comedy"}],
  "keywords": {"results": [{"id":2,"name":"village"}]},
  "watch/providers": {"results": {"IN": {"flatrate": [{"provider_id": 119, "provider_name": "Amazon Prime Video"}]}}},
  "content_ratings": {"results": [{"iso_3166_1": "IN", "rating": "UA 13+"}]}
}`

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

	tv := model.Title{ID: "tmdb:tv:1", Kind: "tv"}
	if err := c.Enrich(context.Background(), &tv); err != nil {
		t.Fatal(err)
	}
	if tv.EpisodeMin != 34 || tv.Seasons != 3 || tv.Providers[0] != "prime" || tv.Certification != "UA 13+" || tv.Keywords[0] != "village" {
		t.Fatalf("tv: %+v", tv)
	}
}
