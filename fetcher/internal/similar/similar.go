// Package similar builds TF-IDF vectors for every title from what people say
// about it plus its metadata, and combines cosine similarity with co-mentions
// ("recommended in the same threads") into a top-K neighbour list. It also
// scores each title against mood descriptions for the pick screen's chips.
package similar

import (
	"math"
	"sort"
	"strings"

	"mealtime/fetcher/internal/state"
	"mealtime/fetcher/internal/text"
)

type Doc struct {
	ID    string
	Terms map[string]float64 // raw term counts
}

type Index struct {
	idf  map[string]float64
	vecs map[string]map[string]float64 // id -> L2-normalised tf-idf
	post map[string][]posting          // term -> titles (common terms dropped), for neighbours
	full map[string][]posting          // term -> every title containing it, for queries
}

type posting struct {
	id string
	w  float64
}

// Build creates the index. Terms present in more than maxDF of the corpus
// are dropped from the postings (they make every pair look alike).
func Build(docs []Doc) *Index {
	df := map[string]int{}
	for _, d := range docs {
		for t := range d.Terms {
			df[t]++
		}
	}
	n := float64(len(docs))
	ix := &Index{idf: map[string]float64{}, vecs: map[string]map[string]float64{}, post: map[string][]posting{}, full: map[string][]posting{}}
	for t, c := range df {
		ix.idf[t] = math.Log((1+n)/(1+float64(c))) + 1
	}
	maxDF := int(math.Max(50, n*0.15))
	for _, d := range docs {
		v := map[string]float64{}
		var norm float64
		for t, c := range d.Terms {
			w := (1 + math.Log(c)) * ix.idf[t] // sublinear tf
			v[t] = w
			norm += w * w
		}
		norm = math.Sqrt(norm)
		if norm == 0 {
			continue
		}
		for t := range v {
			v[t] /= norm
			ix.full[t] = append(ix.full[t], posting{d.ID, v[t]})
			if df[t] <= maxDF && df[t] > 1 {
				ix.post[t] = append(ix.post[t], posting{d.ID, v[t]})
			}
		}
		ix.vecs[d.ID] = v
	}
	return ix
}

// Query scores an ad-hoc text (a mood description) against every title.
func (ix *Index) Query(terms []string) map[string]float64 {
	q := map[string]float64{}
	for _, t := range terms {
		q[t]++
	}
	var norm float64
	for t, c := range q {
		w := (1 + math.Log(c)) * ix.idf[t]
		q[t] = w
		norm += w * w
	}
	norm = math.Sqrt(norm)
	out := map[string]float64{}
	if norm == 0 {
		return out
	}
	for t, qw := range q {
		for _, p := range ix.full[t] {
			out[p.id] += qw / norm * p.w
		}
	}
	return out
}

// Neighbour is a similar title with a combined score.
type Neighbour struct {
	ID    string
	Score float64
}

// Neighbours returns each title's top-k similar titles:
// 0.6 × co-mention strength + 0.4 × TF-IDF cosine.
func (ix *Index) Neighbours(ids []string, st *state.State, k int) map[string][]Neighbour {
	// Co-mention strength normalised by how often each title is mentioned.
	freq := map[string]float64{}
	co := map[string]map[string]float64{}
	for key, c := range st.CoMentions {
		a, b, ok := strings.Cut(key, "|")
		if !ok {
			continue
		}
		freq[a] += float64(c)
		freq[b] += float64(c)
		if co[a] == nil {
			co[a] = map[string]float64{}
		}
		if co[b] == nil {
			co[b] = map[string]float64{}
		}
		co[a][b] = float64(c)
		co[b][a] = float64(c)
	}
	allowed := map[string]bool{}
	for _, id := range ids {
		allowed[id] = true
	}
	out := map[string][]Neighbour{}
	for _, id := range ids {
		scores := map[string]float64{}
		if v, ok := ix.vecs[id]; ok {
			for t, w := range v {
				for _, p := range ix.post[t] {
					if p.id != id && allowed[p.id] {
						scores[p.id] += 0.4 * w * p.w
					}
				}
			}
		}
		for other, c := range co[id] {
			if other == id || !allowed[other] {
				continue
			}
			// Needs at least two shared threads before it counts.
			if c < 2 {
				continue
			}
			scores[other] += 0.6 * c / math.Sqrt(freq[id]*freq[other])
		}
		var ns []Neighbour
		for o, s := range scores {
			if s > 0.02 {
				ns = append(ns, Neighbour{o, math.Round(s*1000) / 1000})
			}
		}
		sort.Slice(ns, func(i, j int) bool { return ns[i].Score > ns[j].Score })
		if len(ns) > k {
			ns = ns[:k]
		}
		out[id] = ns
	}
	return out
}

// DocFor builds a title's term document: people's words count double
// relative to its synopsis, because they describe how it feels to watch.
func DocFor(ts *state.TitleState) Doc {
	terms := map[string]float64{}
	for t, c := range ts.Terms {
		terms[t] += 2 * float64(c)
	}
	t := ts.Title
	for _, w := range text.Terms(t.Overview) {
		terms[w]++
	}
	for _, g := range t.Genres {
		for _, w := range text.Terms(g) {
			terms["genre_"+w] += 3
		}
	}
	for _, kw := range t.Keywords {
		for _, w := range text.Terms(kw) {
			terms[w] += 1.5
		}
	}
	if t.Lang != "" {
		terms["lang_"+t.Lang] += 2
	}
	return Doc{ID: t.ID, Terms: terms}
}

// MoodQueries describe each chip in words viewers actually use.
var MoodQueries = map[string]string{
	"funny":    "funny hilarious comedy laugh humor witty genre comedy",
	"feelgood": "wholesome heartwarming feel good uplifting sweet warm family friendship genre family genre romance",
	"docu":     "documentary docuseries true story real life nature history genre documentary",
	"thriller": "thriller suspense twist gripping mystery tense crime genre thriller genre mystery genre crime",
	"standup":  "stand up comedian special set jokes crowd comedy",
	"sports":   "sports cricket football match team athlete championship",
}

// Moods scores every title 0..1 for each mood chip, mixing TF-IDF relevance
// with what people explicitly said (aspects) and the genre.
func (ix *Index) Moods(aspects map[string]map[string]float64) map[string]map[string]float64 {
	out := map[string]map[string]float64{}
	for mood, q := range MoodQueries {
		// "genre X" pairs become genre features; the rest is plain text.
		fs := strings.Fields(q)
		var plain []string
		var qt []string
		for i := 0; i < len(fs); i++ {
			if fs[i] == "genre" && i+1 < len(fs) {
				qt = append(qt, "genre_"+text.Stem(fs[i+1]))
				i++
				continue
			}
			plain = append(plain, fs[i])
		}
		qt = append(qt, text.Terms(strings.Join(plain, " "))...)
		rel := ix.Query(qt)
		maxRel := 0.0
		for _, v := range rel {
			maxRel = math.Max(maxRel, v)
		}
		for id := range ix.vecs {
			r := 0.0
			if maxRel > 0 {
				r = rel[id] / maxRel
			}
			a := aspects[id][mood]
			score := 0.6*r + 0.4*math.Min(1, a*2)
			if score < 0.05 {
				continue
			}
			if out[id] == nil {
				out[id] = map[string]float64{}
			}
			out[id][mood] = math.Round(score*100) / 100
		}
	}
	return out
}
