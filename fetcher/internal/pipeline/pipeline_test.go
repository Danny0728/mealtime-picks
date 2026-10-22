package pipeline

import (
	"fmt"
	"io"
	"log"
	"testing"
	"time"

	"mealtime/fetcher/internal/config"
	"mealtime/fetcher/internal/discover"
	"mealtime/fetcher/internal/model"
	"mealtime/fetcher/internal/state"
)

func title(id, kind, name string, votes int, genres ...string) model.Title {
	return model.Title{
		ID: id, Kind: kind, Name: name, Year: 2018, Lang: "hi", VoteCount: votes, VoteAverage: 8,
		Genres: genres, Providers: []string{"netflix"}, DetailsLoaded: true, Runtime: 110, EpisodeMin: 30,
	}
}

// A small hand-built world: one hugely popular show, two quietly loved ones.
func world(t *testing.T) (*Pipeline, *state.State) {
	st := state.New()
	for _, tt := range []model.Title{
		title("tmdb:tv:1", "tv", "Breaking Bad", 15000, "Drama", "Crime"),
		title("tmdb:tv:2", "tv", "Panchayat", 300, "Comedy", "Drama"),
		title("tmdb:tv:3", "tv", "Gullak", 120, "Comedy", "Family"),
		title("tmdb:movie:4", "movie", "Overhyped Film", 2000, "Action"),
	} {
		st.Upsert(tt)
	}
	p := New(config.Config{}, config.Secrets{}, st, &discover.Feedback{}, log.New(io.Discard, "", 0))
	p.Now = time.Unix(1_790_000_000, 0)
	p.buildGazetteer()
	return p, st
}

func TestEndToEnd(t *testing.T) {
	p, st := world(t)
	for i := 0; i < 6; i++ {
		th := model.Thread{Platform: "reddit", ID: fmt.Sprintf("t%d", i), Venue: "televisionsuggestions", Title: "Recommend me a wholesome show"}
		p.ingest(th, []model.Comment{
			{Platform: "reddit", ThreadID: th.ID, Venue: th.Venue, Author: fmt.Sprintf("u%d", i), Text: "Panchayat! hilarious and wholesome, great with family", Score: 40, TopLevel: true},
			{Platform: "reddit", ThreadID: th.ID, Venue: th.Venue, Author: fmt.Sprintf("v%d", i), Text: "**Gullak** is so heartwarming, watch it with your parents", Score: 25, TopLevel: true},
			{Platform: "reddit", ThreadID: th.ID, Venue: th.Venue, Author: fmt.Sprintf("w%d", i), Text: "Breaking Bad obviously", Score: 30, TopLevel: true},
		})
	}
	bad := model.Thread{Platform: "reddit", ID: "o1", Venue: "movies", Title: "Most overrated films?"}
	var cs []model.Comment
	for i := 0; i < 5; i++ {
		cs = append(cs, model.Comment{Platform: "reddit", ThreadID: "o1", Venue: "movies", Author: fmt.Sprintf("x%d", i), Text: "Overhyped Film, boring and predictable", Score: 50, TopLevel: true})
	}
	p.ingest(bad, cs)

	cat := BuildCatalog(st, p.stats, "IN", p.Now, 8, 90)
	byID := map[string]Item{}
	for _, it := range cat.Items {
		byID[it.ID] = it
	}
	if _, ok := byID["tmdb:movie:4"]; ok {
		t.Errorf("a title the crowd warns against should be dropped")
	}
	pan, bb := byID["tmdb:tv:2"], byID["tmdb:tv:1"]
	if pan.Gem <= bb.Gem {
		t.Errorf("Panchayat should be more of a hidden gem than Breaking Bad: %.2f vs %.2f", pan.Gem, bb.Gem)
	}
	if pan.Threads != 6 {
		t.Errorf("want 6 recommending threads, got %d", pan.Threads)
	}
	if pan.Moods["funny"] == 0 || byID["tmdb:tv:3"].Moods["feelgood"] == 0 {
		t.Errorf("moods missing: %v / %v", pan.Moods, byID["tmdb:tv:3"].Moods)
	}
	if !contains(pan.Similar, "tmdb:tv:3") {
		t.Errorf("Panchayat and Gullak are recommended together; want them similar, got %v", pan.Similar)
	}
	if !byID["tmdb:tv:3"].Safe {
		t.Errorf("Gullak should be family-safe")
	}
	if bb.Safe {
		t.Errorf("uncertified crime drama should not be family-safe by default")
	}
}

func TestFeedbackTrustsVenues(t *testing.T) {
	p, st := world(t)
	th := model.Thread{Platform: "reddit", ID: "a", Venue: "IndianTeleVision", Title: "Recommend shows"}
	p.ingest(th, []model.Comment{{Platform: "reddit", ThreadID: "a", Venue: th.Venue, Author: "fan1", Text: "Gullak, lovely", Score: 10, TopLevel: true}})
	before := st.Venue("reddit", "IndianTeleVision").Trust()
	p.Feedback = &discover.Feedback{}
	p.Feedback.History = append(p.Feedback.History, struct {
		ID       string `json:"id"`
		Status   string `json:"status"`
		Feedback string `json:"feedback"`
	}{"tmdb:tv:3", "picked", "liked"})
	p.applyFeedback()
	p.applyFeedback() // applied once only
	v := st.Venue("reddit", "IndianTeleVision")
	if v.Liked != 1 || v.Trust() <= before {
		t.Errorf("liking a pick should raise its venue's trust once: liked=%d trust %.2f -> %.2f", v.Liked, before, v.Trust())
	}
	if st.Author("reddit", "fan1").Credibility() <= 1 {
		t.Errorf("author credibility should rise")
	}
}

func contains(xs []string, s string) bool {
	for _, x := range xs {
		if x == s {
			return true
		}
	}
	return false
}
