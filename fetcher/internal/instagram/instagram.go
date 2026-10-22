// Package instagram reads public hashtag posts through Meta's official
// Hashtag Search (Instagram API with Facebook Login). It needs a professional
// account, the instagram_basic permission and the Instagram Public Content
// Access feature approved through App Review. Meta allows 30 unique hashtags
// per account in a rolling 7-day window; the pipeline enforces that budget.
package instagram

import (
	"context"
	"net/url"
	"time"

	"mealtime/fetcher/internal/httpx"
	"mealtime/fetcher/internal/model"
)

type Client struct {
	http    *httpx.Client
	token   string
	userID  string
	version string
}

func New(token, userID, version string) *Client {
	if version == "" {
		version = "v21.0"
	}
	return &Client{http: httpx.New(500 * time.Millisecond), token: token, userID: userID, version: version}
}

func (c *Client) base() string { return "https://graph.facebook.com/" + c.version }

// HashtagID looks up a hashtag. This call counts toward the 30-per-week limit.
func (c *Client) HashtagID(ctx context.Context, tag string) (string, error) {
	q := url.Values{"user_id": {c.userID}, "q": {tag}, "access_token": {c.token}}
	var r struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := c.http.Get(ctx, c.base()+"/ig_hashtag_search?"+q.Encode(), &r); err != nil {
		return "", err
	}
	if len(r.Data) == 0 {
		return "", nil
	}
	return r.Data[0].ID, nil
}

// Media returns top and recent posts for a hashtag as comments (the caption is
// the opinion, likes are the agreement signal).
func (c *Client) Media(ctx context.Context, tag, hashtagID string) ([]model.Comment, error) {
	var out []model.Comment
	for _, edge := range []string{"top_media", "recent_media"} {
		q := url.Values{
			"user_id":      {c.userID},
			"fields":       {"id,caption,like_count,comments_count,permalink,timestamp,media_type"},
			"limit":        {"50"},
			"access_token": {c.token},
		}
		var r struct {
			Data []struct {
				ID       string `json:"id"`
				Caption  string `json:"caption"`
				Likes    int    `json:"like_count"`
				Comments int    `json:"comments_count"`
			} `json:"data"`
		}
		if err := c.http.Get(ctx, c.base()+"/"+hashtagID+"/"+edge+"?"+q.Encode(), &r); err != nil {
			return out, err
		}
		for _, m := range r.Data {
			if m.Caption == "" {
				continue
			}
			out = append(out, model.Comment{
				Platform: "instagram",
				ThreadID: m.ID,
				Venue:    "#" + tag,
				Author:   m.ID, // the API does not expose the author for hashtag media
				Text:     m.Caption,
				Score:    m.Likes + 2*m.Comments,
				TopLevel: true,
			})
		}
	}
	return out, nil
}
