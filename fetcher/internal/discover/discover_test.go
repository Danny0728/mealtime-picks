package discover

import (
	"reflect"
	"testing"
)

func TestSeenRatingsCountAsTaste(t *testing.T) {
	f := &Feedback{
		Seen:        []string{"a", "b", "c", "d"},
		SeenRatings: map[string]string{"a": "liked", "b": "ok", "c": "disliked"},
	}
	f.History = append(f.History, struct {
		ID       string `json:"id"`
		Status   string `json:"status"`
		Feedback string `json:"feedback"`
	}{"p", "picked", "liked"})

	if got, want := f.Liked(), []string{"a", "p"}; !reflect.DeepEqual(got, want) {
		t.Errorf("Liked() = %v, want %v", got, want)
	}
	if got, want := f.Disliked(), []string{"c"}; !reflect.DeepEqual(got, want) {
		t.Errorf("Disliked() = %v, want %v", got, want)
	}
}
