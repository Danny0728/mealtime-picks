package stance

import (
	"strings"
	"testing"

	"mealtime/fetcher/internal/text"
)

func classify(s, thread string) (float64, []string) {
	return Lexicon{}.Classify(text.Tokens(s), thread, true)
}

func TestStance(t *testing.T) {
	cases := []struct {
		text, thread string
		wantPos      bool
	}{
		{"absolute masterpiece, must watch with family", "Recommend me something", true},
		{"ekdum mast picture hai", "best marathi movies?", true},
		{"so boring, couldn't finish it", "Recommend me something", false},
		{"not boring at all, loved it", "", true},
		{"everyone hypes it", "Most overrated shows?", false},
	}
	for _, c := range cases {
		st, _ := classify(c.text, c.thread)
		if (st > 0.15) != c.wantPos {
			t.Errorf("%q in %q: stance %.2f", c.text, c.thread, st)
		}
	}
}

func TestAspects(t *testing.T) {
	_, as := classify("hilarious and wholesome, great with kids", "")
	joined := strings.Join(as, ",")
	for _, want := range []string{"funny", "feelgood", "family"} {
		if !strings.Contains(joined, want) {
			t.Errorf("missing aspect %s in %v", want, as)
		}
	}
	_, as = classify("brilliant but not for kids, very violent", "")
	j := strings.Join(as, ",")
	if !strings.Contains(j, "notkids") || strings.Contains(j, "family") {
		t.Errorf("want notkids without family: %v", as)
	}
}
