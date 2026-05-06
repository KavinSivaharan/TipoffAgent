# /scout — Startup Intelligence Agent

Thesis-driven agent that scrapes startup signals from Hacker News, TechCrunch, Crunchbase, Google News, LinkedIn, etc. and returns a ranked report with evidence.

## What it does

You paste a thesis. Agent picks the right sources, runs them in parallel, synthesizes a markdown report.

| Thesis | Sources it routes to |
|---|---|
| "Small startups that just got acquired" | TechCrunch + Google News |
| "Who's hiring senior ML engineers" | HN Who Is Hiring + Google News |
| "Startups that just raised Series A" | Crunchbase + TechCrunch + SEC EDGAR |
| "AI startups gaining momentum" | HN + Product Hunt + Twitter |

## Setup (one-time, per teammate)

1. **Open this project in Claude Code**
2. **Connect Apify MCP server** (already connected for Kavin's machine; teammates need to connect on theirs):
   - Apify MCP gives access to thousands of pre-built scrapers ("Actors")
   - Connect via Claude Code MCP settings → add Apify
3. Verify `.claude/commands/scout.md` exists in this repo

## Usage

Inside Claude Code:

```
/scout small startups that just got acquired
```

```
/scout who is hiring senior ML engineers right now
```

```
/scout AI infra startups that raised seed in 2026
```

The agent will:
1. Classify the thesis
2. Pick 2-3 relevant Apify Actors
3. Run them in parallel
4. Write a `scout-<thesis>.md` report with ranked findings + source citations

## Example output

See `scout-report-acquisitions.md` for a real run on "small startups that just got acquired" — produced 12 confirmed deals across Motorola, Meta, OpenAI, Anthropic, Sierra, Harvey, Salesforce, Canva, Google DeepMind, Microsoft.

## Routing notes (learned from running it)

**Reliable Actors:**
- TechCrunch: `datacach/techcrunch-articles-listing-by-keyword`
- Google News: `automation-lab/google-news-scraper`
- HN keyword search: `gentle_cloud/hacker-news-scraper`
- HN hiring threads: `logiover/hacker-news-who-is-hiring-scraper`
- Crunchbase: `davidsharadbhatt/crunchbase-company-scraper`
- Fundraising: `complex_intricate_networks/fundraising-and-startup-funding-scraper`

**Avoid:** `easyapi/google-news-scraper` (returns 0 items).

## Cost

Most Apify Actors are pay-per-result (~$0.005-$0.015 per item). Typical scout run = ~$0.50-$1.50.

## Roadmap

- [ ] Add LinkedIn Jobs scraper for hiring thesis
- [ ] Add Product Hunt scraper for "verge of breakout"
- [ ] Add scoring function (recency × source-count × thesis-fit)
- [ ] Schedule recurring weekly runs via `/schedule`
