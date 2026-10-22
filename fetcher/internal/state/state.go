// Package state is the pipeline's memory between weekly runs, stored as one
// JSON file in the repo (data/state.json). It holds every mention found so
// far, which threads were already read, how much each subreddit/channel/
// hashtag can be trusted, and which titles get recommended together.
package state

import (
	"encoding/json"
	"errors"
	"math"
	"os"
	"sort"
	"strings"

	"mealtime/fetcher/internal/model"
)

const (
	maxMentionsPerTitle = 150
	maxTermsPerTitle    = 400
	maxCoMentionPairs   = 60000
)

type TitleState struct {
	Title     model.Title     `json:"title"`
	Mentions  []model.Mention `json:"mentions,omitempty"`
	Terms     map[string]int  `json:"terms,omitempty"` // words people use about it
	DetailsAt int64           `json:"detailsAt,omitempty"`
}

// Venue is a subreddit, YouTube channel or Instagram hashtag.
type Venue struct {
	Platform string `json:"platform"`
	Name     string `json:"name"`
	Threads  int    `json:"threads"`  // threads read from it
	Hits     int    `json:"hits"`     // title mentions extracted
	Liked    int    `json:"liked"`    // family 👍 on titles it recommended
	Disliked int    `json:"disliked"` // family 👎 / didn't finish
}

// Trust is how much a venue's opinions count: venues whose threads yield real
// titles, and whose picks the family liked, count for more.
func (v *Venue) Trust() float64 {
	if v == nil {
		return 1
	}
	yield := float64(v.Hits) / float64(v.Threads*4+4) // ~4 titles per thread is a good thread
	t := 0.6 + 0.6*math.Min(yield, 1)
	fb := (float64(v.Liked) + 2) / (float64(v.Disliked) + 2)
	return clamp(t*fb, 0.3, 2)
}

type Author struct {
	Liked    int `json:"liked"`
	Disliked int `json:"disliked"`
}

// Credibility weights people whose past recommendations the family liked.
func (a *Author) Credibility() float64 {
	if a == nil {
		return 1
	}
	return clamp((float64(a.Liked)+3)/(float64(a.Disliked)+3), 0.5, 2)
}

type Instagram struct {
	HashtagIDs map[string]string `json:"hashtagIds"`
	QueriedAt  map[string]int64  `json:"queriedAt"` // tag -> unix of first query in window
	CoTags     map[string]int    `json:"coTags"`    // tags seen next to good captions
}

type State struct {
	Version         int                    `json:"version"`
	UpdatedAt       int64                  `json:"updatedAt"`
	Titles          map[string]*TitleState `json:"titles"`
	SeenThreads     map[string]int64       `json:"seenThreads"`
	Venues          map[string]*Venue      `json:"venues"`
	Authors         map[string]*Author     `json:"authors"`
	CoMentions      map[string]int         `json:"coMentions"`
	Resolved        map[string]string      `json:"resolved"` // phrase -> title id ("" = not found)
	Instagram       Instagram              `json:"instagram"`
	FeedbackApplied map[string]string      `json:"feedbackApplied"` // title id -> feedback already counted
}

func New() *State {
	return &State{
		Version:         1,
		Titles:          map[string]*TitleState{},
		SeenThreads:     map[string]int64{},
		Venues:          map[string]*Venue{},
		Authors:         map[string]*Author{},
		CoMentions:      map[string]int{},
		Resolved:        map[string]string{},
		Instagram:       Instagram{HashtagIDs: map[string]string{}, QueriedAt: map[string]int64{}, CoTags: map[string]int{}},
		FeedbackApplied: map[string]string{},
	}
}

func Load(path string) (*State, error) {
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return New(), nil
	}
	if err != nil {
		return nil, err
	}
	s := New()
	if err := json.Unmarshal(b, s); err != nil {
		return nil, err
	}
	// Maps may be missing in older files.
	n := New()
	if s.Titles == nil {
		s.Titles = n.Titles
	}
	if s.SeenThreads == nil {
		s.SeenThreads = n.SeenThreads
	}
	if s.Venues == nil {
		s.Venues = n.Venues
	}
	if s.Authors == nil {
		s.Authors = n.Authors
	}
	if s.CoMentions == nil {
		s.CoMentions = n.CoMentions
	}
	if s.Resolved == nil {
		s.Resolved = n.Resolved
	}
	if s.FeedbackApplied == nil {
		s.FeedbackApplied = n.FeedbackApplied
	}
	if s.Instagram.HashtagIDs == nil {
		s.Instagram.HashtagIDs = map[string]string{}
	}
	if s.Instagram.QueriedAt == nil {
		s.Instagram.QueriedAt = map[string]int64{}
	}
	if s.Instagram.CoTags == nil {
		s.Instagram.CoTags = map[string]int{}
	}
	return s, nil
}

func (s *State) Save(path string) error {
	s.compact()
	b, err := json.Marshal(s)
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// Upsert stores fresh metadata for a title, keeping its mentions and terms.
func (s *State) Upsert(t model.Title) *TitleState {
	ts, ok := s.Titles[t.ID]
	if !ok {
		ts = &TitleState{Title: t, Terms: map[string]int{}}
		s.Titles[t.ID] = ts
		return ts
	}
	// Don't let a light listing overwrite loaded details.
	if ts.Title.DetailsLoaded && !t.DetailsLoaded {
		ts.Title.VoteCount, ts.Title.VoteAverage, ts.Title.Popularity = t.VoteCount, t.VoteAverage, t.Popularity
		return ts
	}
	ts.Title = t
	if ts.Terms == nil {
		ts.Terms = map[string]int{}
	}
	return ts
}

func (s *State) Venue(platform, name string) *Venue {
	key := platform + ":" + strings.ToLower(name)
	v, ok := s.Venues[key]
	if !ok {
		v = &Venue{Platform: platform, Name: name}
		s.Venues[key] = v
	}
	return v
}

func (s *State) Author(platform, name string) *Author {
	key := platform + ":" + name
	a, ok := s.Authors[key]
	if !ok {
		a = &Author{}
		s.Authors[key] = a
	}
	return a
}

func PairKey(a, b string) string {
	if a > b {
		a, b = b, a
	}
	return a + "|" + b
}

func (s *State) compact() {
	for _, ts := range s.Titles {
		if len(ts.Mentions) > maxMentionsPerTitle {
			sort.Slice(ts.Mentions, func(i, j int) bool { return ts.Mentions[i].Score > ts.Mentions[j].Score })
			ts.Mentions = ts.Mentions[:maxMentionsPerTitle]
		}
		if len(ts.Terms) > maxTermsPerTitle {
			type kv struct {
				k string
				v int
			}
			var kvs []kv
			for k, v := range ts.Terms {
				kvs = append(kvs, kv{k, v})
			}
			sort.Slice(kvs, func(i, j int) bool { return kvs[i].v > kvs[j].v })
			ts.Terms = map[string]int{}
			for _, e := range kvs[:maxTermsPerTitle] {
				ts.Terms[e.k] = e.v
			}
		}
	}
	if len(s.CoMentions) > maxCoMentionPairs {
		type kv struct {
			k string
			v int
		}
		var kvs []kv
		for k, v := range s.CoMentions {
			kvs = append(kvs, kv{k, v})
		}
		sort.Slice(kvs, func(i, j int) bool { return kvs[i].v > kvs[j].v })
		s.CoMentions = map[string]int{}
		for _, e := range kvs[:maxCoMentionPairs] {
			s.CoMentions[e.k] = e.v
		}
	}
}

func clamp(x, lo, hi float64) float64 { return math.Max(lo, math.Min(hi, x)) }
