// Package score turns raw mentions into trust-worthy signals: consensus
// quality (Wilson lower bound over weighted votes), breadth across threads
// and platforms, and a hidden-gem score that discounts what everyone has seen.
package score

import (
	"math"

	"mealtime/fetcher/internal/model"
	"mealtime/fetcher/internal/state"
)

// Platform weights: Reddit threads are the most deliberate recommendations,
// YouTube comments next, Instagram captions are the noisiest.
var platformWeight = map[string]float64{"reddit": 1.0, "youtube": 0.8, "instagram": 0.5, "saved": 1.5}

type Signals struct {
	Love      float64            `json:"love"`              // weighted positive opinion
	Against   float64            `json:"against"`           // weighted negative opinion
	Quality   float64            `json:"quality"`           // 0..1 consensus that it's good
	Threads   int                `json:"threads"`           // distinct threads recommending it
	People    int                `json:"people"`            // distinct people with an opinion
	Platforms int                `json:"platforms"`         // distinct platforms recommending it
	Gem       float64            `json:"gem"`               // love relative to how widely seen
	Aspects   map[string]float64 `json:"aspects,omitempty"` // share of mentions saying funny/slow/...
}

// Wilson returns the lower bound of the 95% Wilson interval for pos/n.
// It rewards agreement and does not overrate small samples.
func Wilson(pos, n float64) float64 {
	if n <= 0 {
		return 0
	}
	const z = 1.96
	p := pos / n
	denom := 1 + z*z/n
	centre := p + z*z/(2*n)
	margin := z * math.Sqrt((p*(1-p)+z*z/(4*n))/n)
	return math.Max(0, (centre-margin)/denom)
}

// Compute aggregates one title's mentions. Each person counts once per title
// (their strongest opinion), so one superfan can't carry a title.
func Compute(ts *state.TitleState, st *state.State) Signals {
	type opinion struct {
		m model.Mention
		w float64
	}
	byPerson := map[string]opinion{}
	aspectCount := map[string]float64{}
	for _, m := range ts.Mentions {
		w := math.Log1p(math.Max(float64(m.Score), 0)+1) *
			platformWeight[m.Platform] *
			st.Venues[venueKey(m)].Trust() *
			st.Authors[m.Platform+":"+m.Author].Credibility()
		if pw := platformWeight[m.Platform]; pw == 0 {
			w = 0
		}
		key := m.Platform + ":" + m.Author
		if prev, ok := byPerson[key]; !ok || math.Abs(m.Stance)*w > math.Abs(prev.m.Stance)*prev.w {
			byPerson[key] = opinion{m, w}
		}
	}
	var sig Signals
	threads := map[string]bool{}
	platforms := map[string]bool{}
	for _, op := range byPerson {
		switch {
		case op.m.Stance > 0.15:
			sig.Love += op.w * op.m.Stance
			threads[op.m.Platform+":"+op.m.ThreadID] = true
			platforms[op.m.Platform] = true
		case op.m.Stance < -0.15:
			sig.Against += op.w * -op.m.Stance
		}
		for _, a := range op.m.Aspects {
			aspectCount[a]++
		}
	}
	sig.People = len(byPerson)
	sig.Threads = len(threads)
	sig.Platforms = len(platforms)

	// Breadth: 1 thread is an anecdote, ~6 is a consensus.
	breadth := 1 - math.Exp(-float64(sig.Threads)/3)
	cross := 1.0
	switch {
	case sig.Platforms >= 3:
		cross = 1.3
	case sig.Platforms == 2:
		cross = 1.15
	}
	sig.Quality = math.Min(1, Wilson(sig.Love, sig.Love+sig.Against)*breadth*cross)

	// Hidden gem: Reddit love divided by how many people have rated it on
	// TMDB, so Breaking Bad scores modestly and a loved small film scores high.
	sig.Gem = sig.Love / math.Log(3+float64(ts.Title.VoteCount))

	if sig.People > 0 {
		sig.Aspects = map[string]float64{}
		for a, c := range aspectCount {
			sig.Aspects[a] = round2(c / float64(sig.People))
		}
	}
	return sig
}

func venueKey(m model.Mention) string {
	return m.Platform + ":" + lower(m.Venue)
}

func lower(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			b[i] = c + 32
		}
	}
	return string(b)
}

func round2(x float64) float64 { return math.Round(x*100) / 100 }
