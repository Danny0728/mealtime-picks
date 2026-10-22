// Package youtube finds watchable videos (stand-up, documentaries, curated
// channels) and mines recommendation videos' comments for title mentions.
package youtube

import (
	"context"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"mealtime/fetcher/internal/httpx"
	"mealtime/fetcher/internal/model"
)

const base = "https://www.googleapis.com/youtube/v3"

type Client struct {
	http   *httpx.Client
	key    string
	region string
	Units  int // quota units spent this run
}

func New(key, region string) *Client {
	return &Client{http: httpx.New(100 * time.Millisecond), key: key, region: region}
}

func (c *Client) get(ctx context.Context, path string, q url.Values, cost int, out any) error {
	q.Set("key", c.key)
	c.Units += cost
	return c.http.Get(ctx, base+path+"?"+q.Encode(), out)
}

type SearchHit struct {
	VideoID   string
	Title     string
	ChannelID string
	Channel   string
	Desc      string
}

// Search costs 100 quota units per call, so the pipeline budgets it.
func (c *Client) Search(ctx context.Context, query, lang string, max int) ([]SearchHit, error) {
	q := url.Values{
		"part":       {"snippet"},
		"q":          {query},
		"type":       {"video"},
		"maxResults": {strconv.Itoa(max)},
		"regionCode": {c.region},
		"safeSearch": {"moderate"},
	}
	if lang != "" {
		q.Set("relevanceLanguage", lang)
	}
	var r struct {
		Items []struct {
			ID struct {
				VideoID string `json:"videoId"`
			} `json:"id"`
			Snippet struct {
				Title        string `json:"title"`
				Description  string `json:"description"`
				ChannelID    string `json:"channelId"`
				ChannelTitle string `json:"channelTitle"`
			} `json:"snippet"`
		} `json:"items"`
	}
	if err := c.get(ctx, "/search", q, 100, &r); err != nil {
		return nil, err
	}
	var out []SearchHit
	for _, it := range r.Items {
		if it.ID.VideoID == "" {
			continue
		}
		out = append(out, SearchHit{it.ID.VideoID, it.Snippet.Title, it.Snippet.ChannelID, it.Snippet.ChannelTitle, it.Snippet.Description})
	}
	return out, nil
}

// Videos loads duration, stats and full descriptions (1 unit per 50 ids).
func (c *Client) Videos(ctx context.Context, ids []string) ([]model.Title, error) {
	var out []model.Title
	for i := 0; i < len(ids); i += 50 {
		j := min(i+50, len(ids))
		q := url.Values{"part": {"snippet,contentDetails,statistics,status"}, "id": {strings.Join(ids[i:j], ",")}}
		var r struct {
			Items []struct {
				ID      string `json:"id"`
				Snippet struct {
					Title                string   `json:"title"`
					Description          string   `json:"description"`
					ChannelID            string   `json:"channelId"`
					ChannelTitle         string   `json:"channelTitle"`
					PublishedAt          string   `json:"publishedAt"`
					DefaultAudioLanguage string   `json:"defaultAudioLanguage"`
					Tags                 []string `json:"tags"`
					Thumbnails           map[string]struct {
						URL string `json:"url"`
					} `json:"thumbnails"`
				} `json:"snippet"`
				ContentDetails struct {
					Duration      string `json:"duration"`
					ContentRating struct {
						YtRating string `json:"ytRating"`
					} `json:"contentRating"`
				} `json:"contentDetails"`
				Statistics struct {
					ViewCount string `json:"viewCount"`
					LikeCount string `json:"likeCount"`
				} `json:"statistics"`
				Status struct {
					Embeddable  bool `json:"embeddable"`
					MadeForKids bool `json:"madeForKids"`
				} `json:"status"`
			} `json:"items"`
		}
		if err := c.get(ctx, "/videos", q, 1, &r); err != nil {
			return out, err
		}
		for _, it := range r.Items {
			views, _ := strconv.ParseInt(it.Statistics.ViewCount, 10, 64)
			likes, _ := strconv.ParseInt(it.Statistics.LikeCount, 10, 64)
			year := 0
			if len(it.Snippet.PublishedAt) >= 4 {
				year, _ = strconv.Atoi(it.Snippet.PublishedAt[:4])
			}
			lang := it.Snippet.DefaultAudioLanguage
			if k := strings.IndexByte(lang, '-'); k > 0 {
				lang = lang[:k]
			}
			thumb := ""
			for _, size := range []string{"high", "medium", "default"} {
				if t, ok := it.Snippet.Thumbnails[size]; ok {
					thumb = t.URL
					break
				}
			}
			out = append(out, model.Title{
				ID:            "yt:" + it.ID,
				Kind:          "youtube",
				Name:          it.Snippet.Title,
				Year:          year,
				Lang:          lang,
				Overview:      it.Snippet.Description,
				Keywords:      it.Snippet.Tags,
				Runtime:       ParseDuration(it.ContentDetails.Duration),
				Providers:     []string{"youtube"},
				Adult:         it.ContentDetails.ContentRating.YtRating == "ytAgeRestricted",
				Poster:        thumb,
				Link:          "https://www.youtube.com/watch?v=" + it.ID,
				Channel:       it.Snippet.ChannelTitle,
				ViewCount:     views,
				LikeCount:     likes,
				DetailsLoaded: true,
			})
		}
	}
	return out, nil
}

// ChannelUploads lists a channel's most recent uploads (cheap: 1–2 units).
func (c *Client) ChannelUploads(ctx context.Context, channelID string, max int) ([]string, error) {
	var ch struct {
		Items []struct {
			ContentDetails struct {
				RelatedPlaylists struct {
					Uploads string `json:"uploads"`
				} `json:"relatedPlaylists"`
			} `json:"contentDetails"`
		} `json:"items"`
	}
	if err := c.get(ctx, "/channels", url.Values{"part": {"contentDetails"}, "id": {channelID}}, 1, &ch); err != nil {
		return nil, err
	}
	if len(ch.Items) == 0 {
		return nil, nil
	}
	var pl struct {
		Items []struct {
			ContentDetails struct {
				VideoID string `json:"videoId"`
			} `json:"contentDetails"`
		} `json:"items"`
	}
	q := url.Values{
		"part":       {"contentDetails"},
		"playlistId": {ch.Items[0].ContentDetails.RelatedPlaylists.Uploads},
		"maxResults": {strconv.Itoa(max)},
	}
	if err := c.get(ctx, "/playlistItems", q, 1, &pl); err != nil {
		return nil, err
	}
	var ids []string
	for _, it := range pl.Items {
		ids = append(ids, it.ContentDetails.VideoID)
	}
	return ids, nil
}

// Comments returns the most relevant top-level comments on a video (1 unit).
func (c *Client) Comments(ctx context.Context, videoID, channelID string, max int) ([]model.Comment, error) {
	q := url.Values{
		"part":       {"snippet"},
		"videoId":    {videoID},
		"maxResults": {strconv.Itoa(max)},
		"order":      {"relevance"},
		"textFormat": {"plainText"},
	}
	var r struct {
		Items []struct {
			Snippet struct {
				TopLevelComment struct {
					Snippet struct {
						Text      string `json:"textOriginal"`
						Author    string `json:"authorDisplayName"`
						LikeCount int    `json:"likeCount"`
					} `json:"snippet"`
				} `json:"topLevelComment"`
			} `json:"snippet"`
		} `json:"items"`
	}
	if err := c.get(ctx, "/commentThreads", q, 1, &r); err != nil {
		return nil, err
	}
	var out []model.Comment
	for _, it := range r.Items {
		s := it.Snippet.TopLevelComment.Snippet
		out = append(out, model.Comment{
			Platform: "youtube", ThreadID: videoID, Venue: channelID,
			Author: s.Author, Text: s.Text, Score: s.LikeCount, TopLevel: true,
		})
	}
	return out, nil
}

var isoDur = regexp.MustCompile(`^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$`)

// ParseDuration converts ISO-8601 durations like PT1H2M30S to whole minutes.
func ParseDuration(s string) int {
	m := isoDur.FindStringSubmatch(s)
	if m == nil {
		return 0
	}
	n := func(i int) int { v, _ := strconv.Atoi(m[i]); return v }
	secs := n(1)*86400 + n(2)*3600 + n(3)*60 + n(4)
	return (secs + 30) / 60
}
