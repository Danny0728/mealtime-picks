// Command fetcher runs the weekly discovery pipeline and writes catalog.json.
//
//	go run ./cmd/fetcher -config config.json -state ../data/state.json \
//	  -feedback ../data/feedback.json -out ../web/public/catalog.json
//
// Credentials come from environment variables; each missing one skips its
// source. With -offline it only rebuilds the catalog from saved state.
package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"time"

	"mealtime/fetcher/internal/config"
	"mealtime/fetcher/internal/discover"
	"mealtime/fetcher/internal/pipeline"
	"mealtime/fetcher/internal/state"
)

func main() {
	cfgPath := flag.String("config", "config.json", "pipeline configuration")
	statePath := flag.String("state", "../data/state.json", "pipeline memory between runs")
	fbPath := flag.String("feedback", "../data/feedback.json", "backup exported from the app (optional)")
	outPath := flag.String("out", "../web/public/catalog.json", "catalog for the app")
	offline := flag.Bool("offline", false, "skip all network sources; rebuild the catalog from state")
	timeout := flag.Duration("timeout", 50*time.Minute, "stop network work after this long")
	flag.Parse()

	lg := log.New(os.Stderr, "", log.LstdFlags)
	cfg, err := config.Load(*cfgPath)
	if err != nil {
		lg.Fatal(err)
	}
	st, err := state.Load(*statePath)
	if err != nil {
		lg.Fatalf("state: %v", err)
	}
	fb, err := discover.LoadFeedback(*fbPath)
	if err != nil {
		lg.Fatal(err)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()
	ctx, cancelT := context.WithTimeout(ctx, *timeout)
	defer cancelT()

	sec := config.LoadSecrets()
	if *offline {
		sec = config.Secrets{}
	}
	p := pipeline.New(cfg, sec, st, fb, lg)
	stats := p.Run(ctx)

	if err := st.Save(*statePath); err != nil {
		lg.Fatalf("save state: %v", err)
	}
	cat := pipeline.BuildCatalog(st, stats, cfg.Region, time.Now(), cfg.YouTube.MinDurationMin, cfg.YouTube.MaxDurationMin)
	if len(cat.Items) == 0 {
		// Never replace a working catalog with an empty one (e.g. missing keys).
		lg.Printf("catalog would be empty; keeping the existing %s", *outPath)
		return
	}
	if err := pipeline.WriteJSON(*outPath, cat); err != nil {
		lg.Fatalf("write catalog: %v", err)
	}
	lg.Printf("catalog: %d items (threads read %d, new mentions %d, resolved %d, youtube units %d)",
		len(cat.Items), stats.Threads, stats.NewMentions, stats.Resolved, stats.YouTubeUnits)
}
