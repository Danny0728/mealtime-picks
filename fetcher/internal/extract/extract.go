// Package extract finds which titles a comment is talking about.
//
// It matches comment text against a gazetteer of known titles (longest match
// first), uses formatting cues (bold, quotes, list items, capitalisation,
// a nearby year) to accept ambiguous names, and disambiguates titles that
// share a name by year, media type and language. Emphasised phrases that
// match nothing are returned so the pipeline can resolve them on TMDB.
package extract

import (
	"math"
	"regexp"
	"strconv"
	"strings"
	"unicode"

	"mealtime/fetcher/internal/model"
	"mealtime/fetcher/internal/text"
)

const maxNameTokens = 8

type entry struct {
	id    string
	kind  string
	year  int
	lang  string
	votes int
	words int
	risky bool // short or common-word name: needs a cue to count
}

type Gazetteer struct {
	byName map[string][]*entry
}

func NewGazetteer() *Gazetteer { return &Gazetteer{byName: map[string][]*entry{}} }

// commonWords are real words that are also titles ("Up", "Her", "Dark").
var commonWords = map[string]bool{}

func init() {
	for _, w := range strings.Fields(`up her it us dark home love life you me them she he him us we they
	now then here there time day night man woman boy girl friends family bad good best great
	split taken drive heat fury nope ray run go stay lucy her joker crash cars coco soul inside
	eternal dear dil ishq pyaar safar fan`) {
		commonWords[w] = true
	}
}

// Add puts a title (and its alternate names) into the gazetteer.
func (g *Gazetteer) Add(t model.Title) {
	if t.Kind == "youtube" {
		return
	}
	names := append([]string{t.Name}, t.AltNames...)
	for _, n := range names {
		key := text.Norm(n)
		if key == "" {
			continue
		}
		words := strings.Fields(key)
		if len(words) > maxNameTokens {
			continue
		}
		e := &entry{id: t.ID, kind: t.Kind, year: t.Year, lang: t.Lang, votes: t.VoteCount, words: len(words)}
		e.risky = isRisky(words)
		dup := false
		for _, ex := range g.byName[key] {
			if ex.id == e.id {
				dup = true
			}
		}
		if !dup {
			g.byName[key] = append(g.byName[key], e)
		}
	}
}

func (g *Gazetteer) Size() int { return len(g.byName) }

func isRisky(words []string) bool {
	if len(words) == 1 {
		w := words[0]
		return len(w) <= 4 || commonWords[w] || text.IsStop(w)
	}
	all := true
	for _, w := range words {
		if !(text.IsStop(w) || commonWords[w]) {
			all = false
		}
	}
	return all
}

type token struct {
	norm      string
	cap       bool // written with a capital letter, not at sentence start
	emph      bool // inside **bold**, *italics* or quotes
	lineStart bool // first word of a line / list item
	rawCap    bool // written with a capital letter anywhere
	seg       int  // tokens between the same punctuation share a segment
}

var emphRe = regexp.MustCompile(`\*\*[^*\n]{1,80}\*\*|__[^_\n]{1,80}__|\*[^*\n]{1,80}\*|"[^"\n]{1,80}"|“[^”\n]{1,80}”`)
var listMarker = regexp.MustCompile(`^\s*(?:\d{1,2}[.)]|[-*•▪➡→]|#\d+)\s*`)

func tokenize(s string) []token {
	spans := emphRe.FindAllStringIndex(s, -1)
	inEmph := func(off int) bool {
		for _, sp := range spans {
			if off >= sp[0] && off < sp[1] {
				return true
			}
		}
		return false
	}
	var out []token
	lineStart, sentenceStart := true, true
	lineOffset := 0
	seg := 0
	for _, line := range strings.Split(s, "\n") {
		lineStart, sentenceStart = true, true
		seg++
		body := line
		skip := 0
		if m := listMarker.FindString(line); m != "" {
			skip = len(m)
			body = line[skip:]
		}
		var b strings.Builder
		wordStart := -1
		capFirst := false
		flush := func() {
			if b.Len() == 0 {
				return
			}
			n := text.Norm(b.String())
			for _, part := range strings.Fields(n) {
				out = append(out, token{
					norm:      part,
					cap:       capFirst && !sentenceStart,
					emph:      inEmph(lineOffset + skip + wordStart),
					lineStart: lineStart,
					rawCap:    capFirst,
					seg:       seg,
				})
				capFirst = false
				lineStart = false
			}
			sentenceStart = false
			b.Reset()
			wordStart = -1
		}
		for i, r := range body {
			if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '\'' || r == '’' || r == '&' {
				if wordStart < 0 {
					wordStart = i
					capFirst = unicode.IsUpper(r)
				}
				b.WriteRune(r)
				continue
			}
			flush()
			if !unicode.IsSpace(r) {
				seg++
			}
			if r == '.' || r == '!' || r == '?' {
				sentenceStart = true
			}
		}
		flush()
		lineOffset += len(line) + 1
	}
	return out
}

// Context describes the thread a comment sits in, used to disambiguate.
type Context struct {
	KindHint string // "movie", "tv" or ""
	Lang     string
}

var tvWords = regexp.MustCompile(`(?i)\b(series|shows?|web ?series|tv|sitcom|kdrama|anime)\b`)
var movieWords = regexp.MustCompile(`(?i)\b(movies?|films?|cinema|picture)\b`)

// KindHint guesses whether a thread asks for movies or series.
func KindHint(title string) string {
	tv, mv := tvWords.MatchString(title), movieWords.MatchString(title)
	switch {
	case tv && !mv:
		return "tv"
	case mv && !tv:
		return "movie"
	}
	return ""
}

// Hit is one title found in a comment, with the words around it.
type Hit struct {
	TitleID string
	Window  []string // normalised tokens around the mention, for stance
}

// Result of scanning one comment.
type Result struct {
	Hits    []Hit
	Unknown []string // emphasised / listed phrases that matched no title
}

func (g *Gazetteer) Scan(s string, ctx Context) Result {
	toks := tokenize(s)
	var res Result
	used := make([]bool, len(toks))
	seen := map[string]bool{}
	for i := 0; i < len(toks); i++ {
		if used[i] {
			continue
		}
		for n := min(maxNameTokens, len(toks)-i); n >= 1; n-- {
			parts := make([]string, n)
			for k := 0; k < n; k++ {
				parts[k] = toks[i+k].norm
			}
			cands := g.byName[strings.Join(parts, " ")]
			if len(cands) == 0 {
				continue
			}
			year := yearNear(toks, i+n)
			cue := toks[i].emph || toks[i].lineStart || toks[i].cap || year > 0
			best := pick(cands, year, ctx, cue)
			if best == nil {
				continue
			}
			for k := i; k < i+n; k++ {
				used[k] = true
			}
			if !seen[best.id] {
				seen[best.id] = true
				res.Hits = append(res.Hits, Hit{TitleID: best.id, Window: window(toks, i, i+n)})
			}
			i += n - 1
			break
		}
	}
	res.Unknown = unknownPhrases(toks, used)
	return res
}

func pick(cands []*entry, year int, ctx Context, cue bool) *entry {
	var best *entry
	bestScore := math.Inf(-1)
	for _, e := range cands {
		if e.risky && !cue {
			continue
		}
		sc := math.Log1p(float64(e.votes)) * 0.2
		if year > 0 {
			if e.year == year {
				sc += 4
			} else if e.year > 0 && abs(e.year-year) > 1 {
				sc -= 2
			}
		}
		if ctx.KindHint != "" && e.kind == ctx.KindHint {
			sc += 1.5
		}
		if ctx.Lang != "" && e.lang == ctx.Lang {
			sc += 1
		}
		if sc > bestScore {
			best, bestScore = e, sc
		}
	}
	return best
}

func yearNear(toks []token, after int) int {
	for k := after; k < min(after+3, len(toks)); k++ {
		if len(toks[k].norm) == 4 {
			if y, err := strconv.Atoi(toks[k].norm); err == nil && y >= 1930 && y <= 2035 {
				return y
			}
		}
	}
	return 0
}

func window(toks []token, from, to int) []string {
	lo, hi := max(0, from-12), min(len(toks), to+12)
	var w []string
	for k := lo; k < hi; k++ {
		if k >= from && k < to {
			continue // the title's own words say nothing about opinion
		}
		w = append(w, toks[k].norm)
	}
	return w
}

// unknownPhrases returns runs of 1–6 emphasised or list-leading tokens that
// were not matched, e.g. "**Kaasav**" for a title missing from the pool.
func unknownPhrases(toks []token, used []bool) []string {
	var out []string
	for i := 0; i < len(toks); {
		if used[i] || !(toks[i].emph || toks[i].lineStart) {
			i++
			continue
		}
		j := i
		emph := toks[i].emph
		for j < len(toks) && !used[j] && j-i < 6 {
			if j > i && (toks[j].seg != toks[i].seg || toks[j].emph != emph || isYear(toks[j].norm)) {
				break
			}
			j++
		}
		// A plain (unformatted) list item counts only when it is short,
		// capitalised and is the whole segment, like "1. Kaasav - lovely".
		wholeSeg := j >= len(toks) || toks[j].seg != toks[i].seg || isYear(toks[j].norm)
		plainOK := !emph && toks[i].rawCap && j-i <= 4 && wholeSeg && !text.IsStop(toks[i].norm)
		if emph || plainOK {
			phrase := make([]string, 0, j-i)
			for k := i; k < j; k++ {
				phrase = append(phrase, toks[k].norm)
			}
			p := strings.Join(phrase, " ")
			if len(p) >= 3 && !isRisky(phrase) {
				out = append(out, p)
			}
		}
		i = max(j, i+1)
	}
	return out
}

func isYear(s string) bool {
	y, err := strconv.Atoi(s)
	return err == nil && len(s) == 4 && y >= 1930 && y <= 2035
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}
