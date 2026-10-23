// Package config loads the fetcher's JSON configuration and secrets.
package config

import (
	"encoding/json"
	"fmt"
	"os"
)

type Budgets struct {
	TMDBPoolPagesPerLanguage int `json:"tmdbPoolPagesPerLanguage"`
	// Beyond the home languages: subtitles are fine for the right title.
	WorldPoolPages           int `json:"worldPoolPages"`  // most-voted, any language
	KoreanPoolPages          int `json:"koreanPoolPages"` // K-dramas and Korean films
	AnimePoolPages           int `json:"animePoolPages"`  // Japanese animation
	TMDBSearchResolves       int `json:"tmdbSearchResolves"`
	TMDBDetails              int `json:"tmdbDetails"`
	RedditQueries            int `json:"redditQueries"`
	RedditThreadsPerQuery    int `json:"redditThreadsPerQuery"`
	RedditTrustedSubSearches int `json:"redditTrustedSubSearches"`
	YouTubeSearches          int `json:"youtubeSearches"`
	YouTubeCommentPages      int `json:"youtubeCommentPages"`
	InstagramHashtagsPer7d   int `json:"instagramUniqueHashtagsPer7Days"`
}

type Channel struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	FamilySafe bool     `json:"familySafe"`
	Moods      []string `json:"moods"`
}

type YouTube struct {
	WatchableQueries      []string  `json:"watchableQueries"`
	RecommendationQueries []string  `json:"recommendationQueries"`
	CuratedChannels       []Channel `json:"curatedChannels"`
	MinDurationMin        int       `json:"minDurationMin"`
	MaxDurationMin        int       `json:"maxDurationMin"`
}

type Instagram struct {
	Enabled       bool     `json:"enabled"`
	GraphVersion  string   `json:"graphVersion"`
	CoreHashtags  []string `json:"coreHashtags"`
	RotatingSlots int      `json:"rotatingSlots"`
}

type Config struct {
	Region           string    `json:"region"`
	Languages        []string  `json:"languages"`
	Budgets          Budgets   `json:"budgets"`
	DiscoveryPhrases []string  `json:"discoveryPhrases"`
	SeedQueries      []string  `json:"seedQueries"`
	YouTube          YouTube   `json:"youtube"`
	Instagram        Instagram `json:"instagram"`
}

// Secrets come from environment variables (GitHub Actions secrets).
// Every source is optional: a missing key just skips that source.
type Secrets struct {
	TMDBToken          string // TMDB v4 read access token
	RedditClientID     string
	RedditClientSecret string
	RedditUserAgent    string
	YouTubeKey         string
	InstagramToken     string
	InstagramUserID    string
}

func Load(path string) (Config, error) {
	var c Config
	b, err := os.ReadFile(path)
	if err != nil {
		return c, fmt.Errorf("read config: %w", err)
	}
	if err := json.Unmarshal(b, &c); err != nil {
		return c, fmt.Errorf("parse config: %w", err)
	}
	if c.Region == "" {
		c.Region = "IN"
	}
	return c, nil
}

func LoadSecrets() Secrets {
	ua := os.Getenv("REDDIT_USER_AGENT")
	if ua == "" {
		ua = "mealtime-picks/0.1 (family recommender; contact via GitHub)"
	}
	return Secrets{
		TMDBToken:          os.Getenv("TMDB_TOKEN"),
		RedditClientID:     os.Getenv("REDDIT_CLIENT_ID"),
		RedditClientSecret: os.Getenv("REDDIT_CLIENT_SECRET"),
		RedditUserAgent:    ua,
		YouTubeKey:         os.Getenv("YOUTUBE_API_KEY"),
		InstagramToken:     os.Getenv("INSTAGRAM_TOKEN"),
		InstagramUserID:    os.Getenv("INSTAGRAM_USER_ID"),
	}
}
