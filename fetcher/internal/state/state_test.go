package state

import (
	"path/filepath"
	"testing"

	"mealtime/fetcher/internal/model"
)

// A title with no terms is saved without the field (omitempty); loading it
// back must still give a usable map, or the next mention panics.
func TestLoadRestoresEmptyTerms(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	s := New()
	s.Upsert(model.Title{ID: "tmdb:tv:1", Kind: "tv", Name: "Gullak", DetailsLoaded: true})
	if err := s.Save(path); err != nil {
		t.Fatal(err)
	}
	got, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	got.Titles["tmdb:tv:1"].Terms["heartwarming"]++ // panicked before the fix
}
