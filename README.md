# Tipoff — Get the tip before everyone else

An AI agent that finds startups about to break out, based on your investment thesis.

Type what you're hunting for — *"AI infra companies hiring senior MLEs"*, *"B2B SaaS that just raised Series A"*, *"stealth AI founded by ex-OpenAI researchers"* — and watch the agent investigate live across real data sources, verify its candidates, and stream back a ranked list with evidence-cited reasoning.

## How it works

```
thesis → parse into criteria → agentic investigation → ranked results (SSE)
```

The agent runs a three-phase loop (Groq tool-calling, `llama-4-scout` for tools + `llama-3.3-70b` for parsing/wrap-up):

1. **Discovery** — picks the 3–5 sources most relevant to *your* thesis and searches them with targeted queries
2. **Verification** — drills into top candidates by name: scrapes their site, checks Twitter for hiring/launch buzz, confirms funding via news/Crunchbase
3. **Ranking** — scores each company 0–100 with reasoning that must cite specific verified evidence; signals are validated against the sources that actually back them

Everything streams to the UI via Server-Sent Events: the agent's thinking, every tool call, and results as they're ranked.

## Data sources (agent tools)

| Tool | Source | Needs Apify? |
|------|--------|:---:|
| `search_yc` | Y Combinator full directory (batch, team size, isHiring) | no |
| `search_hackernews` | Show HN / Launch HN via Algolia | no |
| `search_hn_hiring` | Latest monthly "Ask HN: Who is hiring?" thread | no |
| `search_sec_edgar` | SEC Form D filings, last 90 days | no |
| `search_github` | GitHub weekly trending (repos >20k stars excluded) | yes |
| `search_news` | Google search for funding announcements | yes |
| `search_twitter` | X/Twitter hiring, launch, and founder buzz | yes |
| `search_crunchbase` | Funding history, investors, headcount | yes |
| `scrape_website` | Single-page enrichment scrape | yes |

Each source returns a normalized `Company[]`:

```typescript
{
  name: string;
  url: string;
  description: string;
  source: string;
  sourceData: Record<string, unknown>; // source-specific rich fields
  signals: { hiring?: boolean; github?: boolean; funding?: boolean; launches?: boolean };
}
```

## Stack

- Next.js 14 (App Router) + TypeScript + React 18
- Groq SDK for LLM reasoning and tool-calling
- Apify for the scraping-backed sources
- Server-Sent Events for live streaming — no database, no queue

## Getting started

```bash
npm install
cp .env.example .env.local   # add your keys
npm run dev
```

| Env var | Required | Notes |
|---------|:---:|-------|
| `GROQ_API_KEY` | yes | [console.groq.com/keys](https://console.groq.com/keys) |
| `APIFY_API_TOKEN` | no | enables GitHub/news/Twitter/Crunchbase/scrape tools; YC + HN + SEC work without it |
| `SEC_USER_AGENT` | no | polite UA for EDGAR, e.g. `myapp contact@me.com` |

Open [http://localhost:3000](http://localhost:3000), type a thesis (or click a demo pill), and hit **Investigate**. Results usually land in 30–60 seconds. A **Stop** button cancels a running investigation.

## Project layout

```
src/
├── app/
│   ├── api/investigate/route.ts   # POST endpoint, SSE stream
│   └── page.tsx                   # single-page UI (feed + results)
└── lib/
    ├── thesis.ts                  # thesis → structured criteria (few-shot)
    ├── claude.ts                  # 3-phase agent loop + result validation
    └── sources/                   # one module per data source + tool registry
```

## Scout

`SCOUT_README.md` documents a separate, deeper research workflow (`/scout`) that runs as a Claude Code command with Apify MCP — same mission, different surface.
