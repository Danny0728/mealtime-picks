// Package httpx is a small JSON HTTP client with throttling and retries.
package httpx

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"sync"
	"time"
)

type Client struct {
	HTTP     *http.Client
	Interval time.Duration // minimum gap between requests
	Headers  map[string]string

	mu   sync.Mutex
	last time.Time
}

func New(interval time.Duration) *Client {
	return &Client{
		HTTP:     &http.Client{Timeout: 30 * time.Second},
		Interval: interval,
		Headers:  map[string]string{},
	}
}

func (c *Client) wait(ctx context.Context) error {
	c.mu.Lock()
	next := c.last.Add(c.Interval)
	now := time.Now()
	if next.Before(now) {
		next = now
	}
	c.last = next
	c.mu.Unlock()
	select {
	case <-time.After(time.Until(next)):
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// StatusError is returned for non-2xx responses after retries.
type StatusError struct {
	Code int
	Body string
}

func (e *StatusError) Error() string { return fmt.Sprintf("http %d: %s", e.Code, e.Body) }

// Do sends req (re-created by build on each attempt) and decodes JSON into out.
func (c *Client) Do(ctx context.Context, build func() (*http.Request, error), out any) error {
	var lastErr error
	for attempt := 0; attempt < 4; attempt++ {
		if err := c.wait(ctx); err != nil {
			return err
		}
		req, err := build()
		if err != nil {
			return err
		}
		req = req.WithContext(ctx)
		for k, v := range c.Headers {
			if req.Header.Get(k) == "" {
				req.Header.Set(k, v)
			}
		}
		resp, err := c.HTTP.Do(req)
		if err != nil {
			lastErr = err
			backoff(ctx, attempt, 0)
			continue
		}
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
		resp.Body.Close()
		if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
			lastErr = &StatusError{resp.StatusCode, truncate(string(body))}
			retry, _ := strconv.Atoi(resp.Header.Get("Retry-After"))
			backoff(ctx, attempt, retry)
			continue
		}
		if resp.StatusCode < 200 || resp.StatusCode > 299 {
			return &StatusError{resp.StatusCode, truncate(string(body))}
		}
		if out == nil {
			return nil
		}
		if err := json.Unmarshal(body, out); err != nil {
			return fmt.Errorf("decode %s: %w", req.URL.Path, err)
		}
		return nil
	}
	return lastErr
}

// Get is Do for a plain GET.
func (c *Client) Get(ctx context.Context, url string, out any) error {
	return c.Do(ctx, func() (*http.Request, error) { return http.NewRequest(http.MethodGet, url, nil) }, out)
}

func backoff(ctx context.Context, attempt, retryAfter int) {
	d := time.Duration(1<<attempt) * time.Second
	if retryAfter > 0 {
		d = time.Duration(retryAfter) * time.Second
	}
	if d > 60*time.Second {
		d = 60 * time.Second
	}
	select {
	case <-time.After(d):
	case <-ctx.Done():
	}
}

func truncate(s string) string {
	if len(s) > 300 {
		return s[:300] + "…"
	}
	return s
}
