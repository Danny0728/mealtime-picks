// Package model holds the types shared across sources and the engine.
package model

// Title is anything the app can suggest: a movie, a series or a YouTube video.
type Title struct {
	ID            string   `json:"id"`   // "tmdb:movie:123", "tmdb:tv:456", "yt:VIDEOID"
	Kind          string   `json:"kind"` // movie | tv | youtube
	Name          string   `json:"name"`
	AltNames      []string `json:"altNames,omitempty"`
	Year          int      `json:"year,omitempty"`
	Lang          string   `json:"lang,omitempty"`
	Overview      string   `json:"overview,omitempty"`
	Genres        []string `json:"genres,omitempty"`
	Keywords      []string `json:"keywords,omitempty"`
	Runtime       int      `json:"runtime,omitempty"`    // minutes (movie / video)
	EpisodeMin    int      `json:"episodeMin,omitempty"` // minutes per episode (tv)
	Seasons       int      `json:"seasons,omitempty"`
	VoteCount     int      `json:"voteCount,omitempty"`
	VoteAverage   float64  `json:"voteAverage,omitempty"`
	Popularity    float64  `json:"popularity,omitempty"`
	Providers     []string `json:"providers,omitempty"` // normalized slugs available in region
	Certification string   `json:"cert,omitempty"`
	Adult         bool     `json:"adult,omitempty"`
	Poster        string   `json:"poster,omitempty"`
	Link          string   `json:"link,omitempty"`
	Channel       string   `json:"channel,omitempty"`
	ChannelSafe   bool     `json:"channelSafe,omitempty"`
	ChannelMoods  []string `json:"channelMoods,omitempty"`
	ViewCount     int64    `json:"viewCount,omitempty"`
	LikeCount     int64    `json:"likeCount,omitempty"`
	DetailsLoaded bool     `json:"detailsLoaded,omitempty"`
}

// Comment is a unit of opinion from any platform.
type Comment struct {
	Platform string // reddit | youtube | instagram
	ThreadID string // post / video / media id
	Venue    string // subreddit, channel id, hashtag
	Author   string
	Text     string
	Score    int // upvotes / likes
	TopLevel bool
}

// Thread is the context a comment lives in (a Reddit post, a YouTube video...).
type Thread struct {
	Platform  string
	ID        string
	Venue     string
	Title     string
	Body      string
	Score     int
	Comments  int
	NSFW      bool
	Created   int64
	Query     string // query that found it
	QueryLang string
}

// Mention is one opinion about one title.
type Mention struct {
	TitleID  string   `json:"t"`
	Platform string   `json:"p"`
	Venue    string   `json:"v"`
	ThreadID string   `json:"th"`
	Author   string   `json:"a"`
	Score    int      `json:"s"`
	Stance   float64  `json:"st"` // -1..1
	Aspects  []string `json:"as,omitempty"`
	At       int64    `json:"at"`
}
