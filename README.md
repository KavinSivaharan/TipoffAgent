# Tipoff — Get the tip before everyone else

Tipoff is an AI agent that hunts for startups **about to break out** — not the ones everyone already knows about. You give it an investment thesis in plain English; it investigates live across real data sources, verifies what it finds, and hands back a ranked, evidence-cited list. Every run is remembered, so over time Tipoff learns what's *changing* — which is where the actual tips live.

```
"AI infra companies hiring senior MLEs"
        │
        ▼
┌─ parse thesis ──► structured criteria (industry, stage, signals, best sources)
│
├─ PHASE 1 · DISCOVERY ──► searches the 3-5 sources that fit YOUR thesis, in parallel
├─ PHASE 2 · VERIFICATION ──► drills into top candidates by name: job boards,
│                             Twitter, news, Crunchbase, their own website
├─ PHASE 3 · RANKING ──► deterministic evidence score + LLM narrative
│
▼
ranked results, streamed live · saved to history · diffed against past runs
```

## Why it's different

**1. It verifies before it ranks.** Most "AI search" tools aggregate and summarize. Tipoff's agent picks its top candidates and then goes back out to confirm them: it pulls exact open-role counts from the company's own job board, checks for hiring/launch tweets, and confirms funding rounds — then cites that evidence in its reasoning.

**2. The score is math, not vibes.** Each company's breakout score is 55% computed from raw evidence (star velocity, HN points, Form D recency, open roles, round age, cross-source corroboration) and 45% agent judgment. Expand any result to see exactly which signals earned which points. Same evidence in, same score out.

**3. It has memory.** Every run and every company sighting is stored in a local SQLite database. When a company shows up again, you see its score delta (`↑+7`); when it's never been seen before, it gets a `NEW` badge. Save a thesis to your watchlist and re-run it in one click — what changed since last week *is* the tip. Optionally, a Slack webhook pings you whenever a run surfaces a brand-new company.

## Data sources

| Tool | What it returns | Key |
|------|-----------------|:---:|
| `search_yc` | Full YC directory — batch, team size, isHiring | none |
| `search_hackernews` | Show HN / Launch HN posts with points & comments | none |
| `search_hn_hiring` | Companies posting in the latest "Ask HN: Who is hiring?" thread | none |
| `search_github` | GitHub repo search, 100–20k stars + active in last 60 days | none* |
| `search_sec_edgar` | SEC Form D filings from the last 90 days | none |
| `check_job_openings` | Exact open/senior/technical role counts from a company's public Greenhouse, Lever, or Ashby board | none |
| `search_news` | Funding announcements with amount and round | Apify |
| `search_twitter` | Hiring, launch, and founder buzz on X | Apify |
| `search_crunchbase` | Funding history, investors, headcount | Apify |
| `scrape_website` | Single-page scrape for enrichment | Apify |

\* `GITHUB_TOKEN` optional, raises the rate limit.

**Six of ten tools need no Apify token** — YC, HN (×2), GitHub, SEC, and job boards work out of the box.

Every source normalizes into the same shape:

```typescript
{
  name: string;
  url: string;
  description: string;
  source: string;                        // which tool found it
  sourceData: Record<string, unknown>;   // rich source-specific evidence
  signals: { hiring?: boolean; github?: boolean; funding?: boolean; launches?: boolean };
}
```

Signals are **validated**: a company only gets `hiring: true` if a source that can actually prove hiring (job board, Who's Hiring post, hiring tweet, YC isHiring flag...) backed it. The agent can't hallucinate a signal into existence.

## Quick start

```bash
npm install
cp .env.example .env.local    # add GROQ_API_KEY at minimum
npm run dev                   # → http://localhost:3000
```

| Env var | Required | What it does |
|---------|:---:|--------------|
| `GROQ_API_KEY` | **yes** | Powers thesis parsing + the agent loop ([get one](https://console.groq.com/keys)) |
| `APIFY_API_TOKEN` | no | Unlocks news, Twitter, Crunchbase, website scraping |
| `GITHUB_TOKEN` | no | Raises GitHub search rate limit (no scopes needed) |
| `SEC_USER_AGENT` | no | Polite UA for EDGAR, e.g. `myapp me@email.com` |
| `SLACK_WEBHOOK_URL` | no | Pings you when a run finds a never-seen company |

Then: type a thesis (or click a demo pill) → **Investigate** → watch the live activity feed (the agent's thinking, every tool call, every result) → ranked results stream in, usually in 15–45 seconds. **Stop** cancels mid-run. Hit **☆ WATCH** on a result set to track that thesis.

## How a run works, concretely

1. `POST /api/investigate` opens an SSE stream
2. `llama-3.3-70b` parses your thesis into criteria (industry, stage, keywords, time window, which sources to prioritize)
3. `llama-4-scout` runs the tool-calling loop — discovery sources execute **in parallel** within each turn
4. Phase gates keep it honest: it must hit ≥3 sources before verifying, and must verify before ranking
5. Final JSON is parsed, signals validated, evidence scored, scores blended
6. The run is saved; each company is diffed against its most recent prior sighting (`NEW` / `↑` / `↓`)
7. If configured, Slack gets a note about brand-new finds

The whole investigation state is visible in the feed — hypotheses, tool calls, result summaries, phase transitions. Nothing happens off-screen.

## Project layout

```
src/
├── app/
│   ├── page.tsx                      # entire UI: input, live feed, results, history, watchlist
│   └── api/
│       ├── investigate/route.ts      # POST — runs the agent, streams SSE, persists + diffs
│       ├── runs/route.ts             # GET — run history + real "recent finds"
│       ├── runs/[id]/route.ts        # GET — replay any past run
│       └── watchlist/route.ts        # GET/POST/DELETE — saved theses
└── lib/
    ├── thesis.ts                     # thesis → criteria (few-shot, validated, retry)
    ├── claude.ts                     # 3-phase agent loop, evidence collection, result parsing
    ├── scoring.ts                    # deterministic evidence score + blend
    ├── db.ts                         # SQLite: runs, sightings, watchlist, diffs
    ├── notify.ts                     # Slack webhook (optional)
    └── sources/                      # one module per source + tool registry (index.ts)
```

Data lives in `.data/tipoff.db` (gitignored). Delete the file to reset history.

## Troubleshooting

- **"GROQ_API_KEY is not set"** — copy `.env.example` to `.env.local`, add the key, restart the dev server
- **GitHub rate limit errors** — add a `GITHUB_TOKEN` (any token works, no scopes needed)
- **Apify tools erroring** — some actors require one-time approval in the [Apify console](https://console.apify.com); the agent recovers and routes around failed tools
- **No job board found for a company** — `check_job_openings` covers Greenhouse, Lever, and Ashby; companies on other ATSes fall back to website scraping

## Scout

`SCOUT_README.md` documents **Scout**, a separate deep-research workflow that runs as a Claude Code slash command with Apify MCP — same mission, heavier artillery, different surface.
