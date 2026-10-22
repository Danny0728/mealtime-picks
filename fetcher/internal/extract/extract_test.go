package extract

import (
	"testing"

	"mealtime/fetcher/internal/model"
)

func gaz() *Gazetteer {
	g := NewGazetteer()
	for _, t := range []model.Title{
		{ID: "tmdb:movie:1", Kind: "movie", Name: "Kaasav", Year: 2016, Lang: "mr", VoteCount: 30},
		{ID: "tmdb:tv:2", Kind: "tv", Name: "Panchayat", Year: 2020, Lang: "hi", VoteCount: 400},
		{ID: "tmdb:movie:3", Kind: "movie", Name: "Up", Year: 2009, Lang: "en", VoteCount: 20000},
		{ID: "tmdb:tv:4", Kind: "tv", Name: "Dark", Year: 2017, Lang: "de", VoteCount: 7000},
		{ID: "tmdb:movie:5", Kind: "movie", Name: "Gully Boy", Year: 2019, Lang: "hi", VoteCount: 900},
		{ID: "tmdb:movie:6", Kind: "movie", Name: "Dark", Year: 2005, Lang: "en", VoteCount: 10},
		{ID: "tmdb:movie:7", Kind: "movie", Name: "Schitt's Creek", Year: 2015, Lang: "en", VoteCount: 2000},
	} {
		g.Add(t)
	}
	return g
}

func ids(r Result) map[string]bool {
	m := map[string]bool{}
	for _, h := range r.Hits {
		m[h.TitleID] = true
	}
	return m
}

func TestLongestMatchAndCommonWords(t *testing.T) {
	g := gaz()
	r := g.Scan("We watched gully boy last week and it really picked my mood up", Context{})
	got := ids(r)
	if !got["tmdb:movie:5"] {
		t.Fatalf("expected Gully Boy, got %v", got)
	}
	if got["tmdb:movie:3"] {
		t.Fatalf("'up' as a plain word must not match the film Up: %v", got)
	}
}

func TestCuesAcceptRiskyNames(t *testing.T) {
	g := gaz()
	r := g.Scan("You should watch **Up**, it's lovely", Context{})
	if !ids(r)["tmdb:movie:3"] {
		t.Fatalf("bold Up should match: %+v", r)
	}
}

func TestDisambiguateByKindAndYear(t *testing.T) {
	g := gaz()
	r := g.Scan("Honestly Dark is the best series I've seen", Context{KindHint: "tv"})
	if !ids(r)["tmdb:tv:4"] {
		t.Fatalf("expected the series Dark: %+v", r)
	}
	r = g.Scan("**Dark** (2005) was a fun little film", Context{KindHint: "movie"})
	if !ids(r)["tmdb:movie:6"] {
		t.Fatalf("expected the 2005 film Dark: %+v", r)
	}
}

func TestApostropheAndListItems(t *testing.T) {
	g := gaz()
	r := g.Scan("1. Schitts Creek - so wholesome\n2. Panchayat\n3. Sairat - beautiful", Context{})
	got := ids(r)
	if !got["tmdb:movie:7"] || !got["tmdb:tv:2"] {
		t.Fatalf("expected list titles: %v", got)
	}
	found := false
	for _, u := range r.Unknown {
		if u == "sairat" {
			found = true
		}
	}
	if !found {
		t.Fatalf("Sairat should be queued for resolving, unknown=%v", r.Unknown)
	}
}

func TestUnknownIgnoresSentences(t *testing.T) {
	g := gaz()
	r := g.Scan("I would recommend something light honestly", Context{})
	if len(r.Unknown) != 0 {
		t.Fatalf("plain sentence should not produce unknowns: %v", r.Unknown)
	}
}
