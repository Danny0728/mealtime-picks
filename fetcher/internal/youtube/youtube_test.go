package youtube

import "testing"

func TestParseDuration(t *testing.T) {
	for in, want := range map[string]int{"PT1H2M30S": 63, "PT45S": 1, "PT12M": 12, "P0D": 0, "PT2H": 120, "bad": 0} {
		if got := ParseDuration(in); got != want {
			t.Errorf("%s = %d, want %d", in, got, want)
		}
	}
}
