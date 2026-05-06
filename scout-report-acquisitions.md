# Scout Report — Small Startups Recently Acquired

**Thesis:** Small startups that just got acquired
**Run date:** 2026-05-06
**Sources hit:** TechCrunch (datacach actor) · Google News (automation-lab actor) · Hacker News (nexgendata actor)
**Window:** Last ~30 days, with some 2025 stragglers for context

---

## Top tier — confirmed small-startup deals (2026)

| Acquirer | Target | When | Signal | Source |
|---|---|---|---|---|
| **Motorola** | AI startup developed at Yukonstruct | 2026-05-03 | Tiny Yukon-based AI co. | Yukon News |
| **Meta** | Assured Robot Intelligence | 2026-05-01 | Humanoid robotics, early-stage | TechCrunch / Bloomberg |
| **Sierra** (Bret Taylor) | Fragment (YC-backed) | 2026-04-23 | YC alum, small AI co. | TechCrunch |
| **OpenAI** | Hiro (AI personal finance) | 2026-04-13 | Small consumer AI | TechCrunch |
| **Anthropic** | Coefficient Bio ($400M) | 2026-04-03 | Drug-discovery startup | R&D World |
| **OpenAI** | Astral (dev tooling) | 2026-03-19 | Small dev-tools co., team for Codex | CNBC |
| **Harvey** | Lume | 2026-03-03 | Acquihire #2 for Harvey | Artificial Lawyer |
| **Salesforce** | Clockwise team (acquihire) | 2026-03-20 | Team folded into Agentforce | The Register |
| **Canva** | animation + marketing startups (multiple) | 2026-02-23 | Multiple small acquisitions | TechCrunch |
| **Google DeepMind** | Hume AI team (acquihire) | 2026-01-22 | Voice AI talent grab | TechCrunch |
| **OpenAI** | Convogo (exec-coaching AI) | 2026-01-08 | Small AI tool acquihire | TechCrunch |
| **Microsoft** | Robin AI tech team (acquihire) | 2026-01-09 | Legal AI talent | Artificial Lawyer |

## Second tier — bigger but still notable

| Acquirer | Target | Deal | Why interesting |
|---|---|---|---|
| **Cisco** | Astrix (AI security) | $400M, 2026-05-04 | Mid-size AI security startup |
| **Cisco** | EzDubs (translation) | 2025-11-17 | Small dubbing/AI startup |
| **Meta** | Limitless (AI device) | 2025-12-05 | Hardware AI startup |
| **Spotify** | WhoSampled | 2025-11-19 | Music database, niche |
| **HoneyBook** | Fine.dev | 2025-09-30 | AI "vibe coding" for SMBs |
| **SAP** | NemoClaw (18-mo German AI lab) | $1.16B, 2026-05-05 | Hot deal — young AI lab |

## Blocked / contested

- **Meta ↔ Manus** ($2B) — China blocked the deal on security grounds (2026-04-27). Heavy press cycle.

## Trend signal in the data itself

- **"Acquihire" is a saturating story.** FTC/DOJ are openly scrutinizing tech acquihires (Reuters, Bloomberg, CNBC, Mintz). Sen. Warren pushed FTC/DOJ Feb 2026.
- Multiple 2026 articles on tech *talent* acquihires being treated as M&A by regulators — relevant if tracking deals that may be challenged.
- *Crunchbase News (2026-03-16):* "Small And Mid-Sized Startup Purchases Are Still Well Below The 2021 Peak" — context for interpreting volume.

---

## What worked / what didn't

**Worked:**
- TechCrunch keyword scraper — 10 highly-relevant headlines first try
- Google News (automation-lab actor) — broad coverage, good for cross-source confirmation

**Didn't:**
- `easyapi/google-news-scraper` returned 0 items every time — likely broken, swapped out
- `nexgendata/hacker-news-scraper` (top 100) — almost no acquisition stories on the front page right now; HN front page is poor signal for this thesis. Better to use HN Algolia search for "acquired" historically.

**Better routing for this thesis next time:**
1. TechCrunch keyword search ← high precision
2. Google News query ← high recall
3. HN Algolia search (via gentle_cloud actor) instead of front-page top
4. Crunchbase scraper for confirmed deal data + amounts
