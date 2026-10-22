// Package stance decides whether a mention recommends a title or warns
// against it, and what people say about it (funny, slow, not for kids...).
//
// v1 is a lexicon model that understands English plus common Hindi/Marathi
// words written in Latin script ("ekdum mast", "bakwas"), with negation
// handling and a thread-level prior. The Classifier interface lets a
// multilingual model replace it later without touching the pipeline.
package stance

import (
	"math"
	"regexp"
	"strings"
)

type Classifier interface {
	Classify(window []string, threadTitle string, topLevel bool) (stance float64, aspects []string)
}

type Lexicon struct{}

var positive = weights(map[string]float64{
	"must watch": 1.5, "masterpiece": 1.5, "highly recommend": 1.5, "hidden gem": 1.4, "gem": 1.0,
	"underrated": 1.0, "loved": 1.0, "love": 0.7, "amazing": 1.0, "brilliant": 1.1, "fantastic": 1.0,
	"great": 0.7, "excellent": 1.0, "favorite": 0.9, "favourite": 0.9, "beautiful": 0.8, "best": 0.7,
	"recommend": 0.8, "worth": 0.6, "perfect": 0.8, "awesome": 0.9, "incredible": 1.0, "gold": 0.6,
	"wholesome": 0.8, "heartwarming": 0.9, "hilarious": 0.8, "gripping": 0.8, "binge": 0.6, "classic": 0.6,
	"10 10": 1.2, "goosebumps": 0.9, "cried": 0.4, "rewatch": 0.7,
	// Hindi / Marathi in Latin script
	"mast": 1.0, "ekdum": 0.5, "zabardast": 1.1, "kamaal": 1.0, "lajawab": 1.1, "jhakaas": 1.1,
	"bhari": 1.0, "bhaari": 1.0, "sundar": 0.8, "accha": 0.6, "achha": 0.6, "badhiya": 0.9, "bhannat": 1.1,
	"chan": 0.6, "khup chan": 1.1, "dhamal": 0.9, "paisa vasool": 1.1,
})

var negative = weights(map[string]float64{
	"overrated": 1.3, "boring": 1.1, "waste": 1.2, "waste of time": 1.5, "terrible": 1.3, "awful": 1.3,
	"worst": 1.4, "disappointing": 1.1, "disappointed": 1.0, "skip": 0.9, "meh": 0.8, "avoid": 1.1,
	"dropped": 0.9, "couldnt finish": 1.2, "not worth": 1.3, "cringe": 1.0, "mediocre": 0.9, "bad": 0.7,
	"hated": 1.2, "hate": 0.9, "regret": 1.0, "dull": 0.9, "predictable": 0.5, "unwatchable": 1.4,
	"bakwas": 1.3, "faltu": 1.2, "bekar": 1.1, "bekaar": 1.1, "pakau": 1.0, "timepass": 0.2,
})

var negators = map[string]bool{
	"not": true, "never": true, "no": true, "isnt": true, "wasnt": true, "dont": true, "didnt": true,
	"doesnt": true, "hardly": true, "nahi": true, "nahin": true, "mat": true, "nako": true, "nai": true,
}

// Aspects are what viewers say about a title; they feed moods and safety.
var aspectWords = map[string][]string{
	"funny":    {"funny", "hilarious", "comedy", "laugh", "laughed", "lol", "comic", "humor", "humour", "hasa", "hasi", "majedar"},
	"feelgood": {"wholesome", "heartwarming", "feel good", "feelgood", "uplifting", "sweet", "cozy", "comforting", "warm", "light hearted", "lighthearted"},
	"dark":     {"dark", "disturbing", "violent", "violence", "gore", "gory", "brutal", "gritty", "bloody"},
	"slow":     {"slow", "slow burn", "slowburn", "pacing", "dragged", "lengthy"},
	"family":   {"family", "kids", "parents", "together", "everyone", "grandparents", "all ages", "parivar"},
	"notkids":  {"not for kids", "adult", "nsfw", "explicit", "nudity", "sexual", "sex", "18", "abusive", "gaali", "cuss"},
	"thriller": {"thriller", "suspense", "edge of", "twist", "twists", "gripping", "tense", "mystery"},
	"docu":     {"documentary", "docuseries", "docu", "true story", "real story", "real life"},
	"sports":   {"cricket", "football", "sports", "match", "athlete", "olympic"},
	"standup":  {"stand up", "standup", "comedian", "special", "set"},
	"short":    {"short", "quick", "few episodes", "mini series", "miniseries", "limited series"},
}

var negThread = regexp.MustCompile(`(?i)\b(overrated|worst|disappoint\w*|hate|hated|regret|waste|unpopular opinion|dropped)\b`)
var recThread = regexp.MustCompile(`(?i)\b(recommend\w*|suggest\w*|underrated|hidden gems?|must watch|similar to|something like|what should|looking for|best|favou?rite)\b`)

type lex struct {
	words []string
	w     float64
}

func weights(m map[string]float64) []lex {
	var out []lex
	for k, v := range m {
		out = append(out, lex{strings.Fields(k), v})
	}
	return out
}

func (Lexicon) Classify(window []string, threadTitle string, topLevel bool) (float64, []string) {
	score := 0.0
	switch {
	case negThread.MatchString(threadTitle):
		score -= 0.6
	case recThread.MatchString(threadTitle) && topLevel:
		// Answering "recommend me X" with a title is itself a recommendation.
		score += 0.5
	}
	score += hits(window, positive) - hits(window, negative)
	st := math.Tanh(score)
	return st, aspects(window)
}

func hits(win []string, lexicon []lex) float64 {
	total := 0.0
	for i := range win {
		for _, l := range lexicon {
			if i+len(l.words) > len(win) {
				continue
			}
			match := true
			for k, w := range l.words {
				if win[i+k] != w {
					match = false
					break
				}
			}
			if !match {
				continue
			}
			sign := 1.0
			for k := max(0, i-3); k < i; k++ {
				if negators[win[k]] {
					sign = -0.8
				}
			}
			total += sign * l.w
		}
	}
	return total
}

func aspects(win []string) []string {
	joined := " " + strings.Join(win, " ") + " "
	var out []string
	for name, words := range aspectWords {
		for _, w := range words {
			if strings.Contains(joined, " "+w+" ") {
				out = append(out, name)
				break
			}
		}
	}
	// "not for kids" also contains "kids": don't call it family-friendly.
	if contains(out, "notkids") {
		out = remove(out, "family")
	}
	return out
}

func contains(xs []string, s string) bool {
	for _, x := range xs {
		if x == s {
			return true
		}
	}
	return false
}

func remove(xs []string, s string) []string {
	var out []string
	for _, x := range xs {
		if x != s {
			out = append(out, x)
		}
	}
	return out
}
