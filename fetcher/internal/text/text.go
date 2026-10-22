// Package text has the normalisation shared by matching, stance and TF-IDF.
package text

import (
	"strings"
	"unicode"
)

// accents folds the accented Latin letters that show up in film titles
// ("Amélie", "Pokémon") without pulling in a Unicode normalisation dependency.
var accents = strings.NewReplacer(
	"á", "a", "à", "a", "â", "a", "ä", "a", "ã", "a", "å", "a",
	"é", "e", "è", "e", "ê", "e", "ë", "e",
	"í", "i", "ì", "i", "î", "i", "ï", "i",
	"ó", "o", "ò", "o", "ô", "o", "ö", "o", "õ", "o", "ø", "o",
	"ú", "u", "ù", "u", "û", "u", "ü", "u",
	"ñ", "n", "ç", "c", "ý", "y",
	"Á", "a", "É", "e", "Í", "i", "Ó", "o", "Ú", "u", "Ñ", "n",
)

// Norm lowercases, strips accents and punctuation, and collapses spaces, so
// "Kaasav (2016)" and "kaasav" compare equal on their name part.
func Norm(s string) string {
	return strings.Join(Tokens(s), " ")
}

// Tokens splits into lowercase word tokens. "&" becomes "and" and
// apostrophes are dropped so "Schitt's" == "schitts".
func Tokens(s string) []string {
	s = accents.Replace(s)
	var toks []string
	var b strings.Builder
	flush := func() {
		if b.Len() > 0 {
			toks = append(toks, b.String())
			b.Reset()
		}
	}
	for _, r := range s {
		switch {
		case unicode.Is(unicode.Mn, r): // combining accent marks
		case r == '\'' || r == '’':
		case r == '&':
			flush()
			toks = append(toks, "and")
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			b.WriteRune(unicode.ToLower(r))
		default:
			flush()
		}
	}
	flush()
	return toks
}

var stop = map[string]bool{}

func init() {
	for _, w := range strings.Fields(`a an the and or but if of to in on at for with from by as is are was were be been being
	it its this that these those i me my we our you your he she they them his her their what which who whom
	so very just also too can could would should will do does did done have has had not no yes
	there here than then about into over after before up down out more most some any all each other
	movie movies film films show shows series watch watched watching episode episodes season seasons
	one really like get got go going see seen thing things lot much even still well make made
	hai hain ka ki ke ko se me aur bhi toh nahi ye wo`) {
		stop[w] = true
	}
}

// IsStop reports whether a token carries no topical meaning.
func IsStop(t string) bool { return stop[t] }

// Stem is a deliberately light suffix stripper: enough that "laughing",
// "laughs" and "laughed" share a term, without a dependency.
func Stem(t string) string {
	if len(t) <= 4 {
		return t
	}
	for _, suf := range []string{"ingly", "ness", "ing", "edly", "ed", "ly", "ies", "es", "s"} {
		if strings.HasSuffix(t, suf) && len(t)-len(suf) >= 3 {
			base := t[:len(t)-len(suf)]
			if suf == "ies" {
				base += "y"
			}
			return base
		}
	}
	return t
}

// Terms returns stemmed, stop-word-free terms plus adjacent bigrams, which
// keeps phrases like "slow burn" and "feel good" as distinct features.
func Terms(s string) []string {
	toks := Tokens(s)
	var out []string
	prev := ""
	for _, t := range toks {
		if IsStop(t) || len(t) < 2 || isNumber(t) {
			prev = ""
			continue
		}
		st := Stem(t)
		out = append(out, st)
		if prev != "" {
			out = append(out, prev+"_"+st)
		}
		prev = st
	}
	return out
}

func isNumber(t string) bool {
	for _, r := range t {
		if !unicode.IsDigit(r) {
			return false
		}
	}
	return true
}
