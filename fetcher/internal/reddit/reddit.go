// Package reddit searches recommendation threads across all of Reddit using
// app-only OAuth, and reads their top-level comments.
package reddit

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"mealtime/fetcher/internal/httpx"
	"mealtime/fetcher/internal/model"
)

type Client struct {
	http           *httpx.Client
	id, secret, ua string
	token          string
	tokenExp       time.Time
}

func New(id, secret, userAgent string) *Client {
	// Stay well under Reddit's OAuth rate limit.
	h := httpx.New(1100 * time.Millisecond)
	h.Headers["User-Agent"] = userAgent
	return &Client{http: h, id: id, secret: secret, ua: userAgent}
}

func (c *Client) auth(ctx context.Context) error {
	if c.token != "" && time.Now().Before(c.tokenExp) {
		return nil
	}
	var r struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	err := c.http.Do(ctx, func() (*http.Request, error) {
		form := url.Values{"grant_type": {"client_credentials"}}
		req, err := http.NewRequest(http.MethodPost, "https://www.reddit.com/api/v1/access_token", strings.NewReader(form.Encode()))
		if err != nil {
			return nil, err
		}
		req.SetBasicAuth(c.id, c.secret)
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		return req, nil
	}, &r)
	if err != nil {
		return err
	}
	c.token = r.AccessToken
	c.tokenExp = time.Now().Add(time.Duration(r.ExpiresIn-60) * time.Second)
	return nil
}

func (c *Client) get(ctx context.Context, path string, q url.Values, out any) error {
	if err := c.auth(ctx); err != nil {
		return err
	}
	u := "https://oauth.reddit.com" + path + "?" + q.Encode()
	return c.http.Do(ctx, func() (*http.Request, error) {
		req, err := http.NewRequest(http.MethodGet, u, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "bearer "+c.token)
		return req, nil
	}, out)
}

type listing struct {
	Data struct {
		Children []struct {
			Kind string          `json:"kind"`
			Data json.RawMessage `json:"data"`
		} `json:"children"`
	} `json:"data"`
}

type post struct {
	ID          string  `json:"id"`
	Subreddit   string  `json:"subreddit"`
	Title       string  `json:"title"`
	Selftext    string  `json:"selftext"`
	Score       int     `json:"score"`
	NumComments int     `json:"num_comments"`
	Over18      bool    `json:"over_18"`
	Created     float64 `json:"created_utc"`
}

type comment struct {
	ID     string `json:"id"`
	Author string `json:"author"`
	Body   string `json:"body"`
	Score  int    `json:"score"`
}

// Search finds threads for a query, across all subreddits or within one.
func (c *Client) Search(ctx context.Context, query, subreddit string, limit int) ([]model.Thread, error) {
	q := url.Values{
		"q":        {query},
		"type":     {"link"},
		"sort":     {"relevance"},
		"t":        {"all"},
		"limit":    {strconv.Itoa(limit)},
		"raw_json": {"1"},
	}
	path := "/search"
	if subreddit != "" {
		path = "/r/" + url.PathEscape(subreddit) + "/search"
		q.Set("restrict_sr", "1")
	}
	var l listing
	if err := c.get(ctx, path, q, &l); err != nil {
		return nil, err
	}
	var out []model.Thread
	for _, ch := range l.Data.Children {
		if ch.Kind != "t3" {
			continue
		}
		var p post
		if json.Unmarshal(ch.Data, &p) != nil {
			continue
		}
		out = append(out, model.Thread{
			Platform: "reddit",
			ID:       p.ID,
			Venue:    p.Subreddit,
			Title:    p.Title,
			Body:     p.Selftext,
			Score:    p.Score,
			Comments: p.NumComments,
			NSFW:     p.Over18,
			Created:  int64(p.Created),
			Query:    query,
		})
	}
	return out, nil
}

// TopComments returns the thread's top-level comments, best first.
func (c *Client) TopComments(ctx context.Context, th model.Thread, limit int) ([]model.Comment, error) {
	q := url.Values{
		"depth":    {"1"},
		"limit":    {strconv.Itoa(limit)},
		"sort":     {"top"},
		"raw_json": {"1"},
	}
	var resp []listing
	if err := c.get(ctx, "/comments/"+th.ID, q, &resp); err != nil {
		return nil, err
	}
	if len(resp) < 2 {
		return nil, nil
	}
	var out []model.Comment
	for _, ch := range resp[1].Data.Children {
		if ch.Kind != "t1" {
			continue
		}
		var cm comment
		if json.Unmarshal(ch.Data, &cm) != nil || cm.Body == "" || cm.Author == "[deleted]" || cm.Author == "AutoModerator" {
			continue
		}
		out = append(out, model.Comment{
			Platform: "reddit",
			ThreadID: th.ID,
			Venue:    th.Venue,
			Author:   cm.Author,
			Text:     cm.Body,
			Score:    cm.Score,
			TopLevel: true,
		})
	}
	return out, nil
}
