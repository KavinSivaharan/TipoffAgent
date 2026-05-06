import Groq from "groq-sdk";
import { ScoredCompany, ThesisCriteria, InvestigationEvent } from "./types";
import { toolDefinitions, executeTool, summarizeToolResult } from "./sources";

function getClient() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

const TOOL_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : text.trim();
}

function autoCloseJSON(text: string): string {
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escape = false;
  for (const c of text) {
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") braces++;
    else if (c === "}") braces--;
    else if (c === "[") brackets++;
    else if (c === "]") brackets--;
  }
  let result = text.replace(/,\s*\{[^}]*$/, "");
  result = result.replace(/,\s*$/, "").trimEnd();
  while (brackets-- > 0) result += "]";
  while (braces-- > 0) result += "}";
  return result;
}

function tryExtractCompanies(text: string): unknown[] | null {
  const candidates: string[] = [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidates.push(fenced[1]);
  const unfenced = text.match(/```(?:json)?\s*([\s\S]*)$/);
  if (unfenced) candidates.push(unfenced[1]);
  const fromBrace = text.indexOf("{");
  if (fromBrace !== -1) candidates.push(text.substring(fromBrace));
  candidates.push(text);

  for (const raw of candidates) {
    const trimmed = raw.trim();
    for (const variant of [trimmed, autoCloseJSON(trimmed)]) {
      try {
        const parsed = JSON.parse(variant);
        const arr = parsed.companies || parsed;
        if (Array.isArray(arr) && arr.length > 0) return arr;
      } catch {}
    }
  }
  return null;
}

function extractFailedGeneration(err: unknown): string | null {
  const e = err as {
    error?: { failed_generation?: string };
    body?: { error?: { failed_generation?: string } };
    message?: string;
    code?: string;
  };
  const direct = e?.error?.failed_generation || e?.body?.error?.failed_generation;
  if (direct) return direct;
  if (typeof e?.message === "string" && e.message.includes("failed_generation")) {
    const m = e.message.match(/"failed_generation"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (m && m[1]) {
      try {
        return JSON.parse(`"${m[1]}"`);
      } catch {
        return m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      }
    }
  }
  return null;
}

export async function parseThesis(thesis: string): Promise<ThesisCriteria> {
  const client = getClient();
  const response = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "user",
        content: `Parse this startup investment thesis into structured criteria. Return JSON only, no markdown.

Thesis: "${thesis}"

Return this exact JSON shape:
{
  "industry": "primary industry/sector",
  "stage": "startup stage (seed, series A, growth, etc)",
  "signals": ["list of signals to prioritize like hiring, github_activity, funding, launches"],
  "keywords": ["specific keywords to match against company descriptions"],
  "raw": "the original thesis"
}`,
      },
    ],
    temperature: 0.2,
    max_tokens: 512,
  });

  const text = response.choices[0]?.message?.content || "";
  try {
    return JSON.parse(extractJSON(text));
  } catch {
    return {
      industry: "technology",
      stage: "any",
      signals: ["hiring", "github", "funding", "launches"],
      keywords: thesis
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3),
      raw: thesis,
    };
  }
}

const SYSTEM_PROMPT = `You are Tipoff — an INVESTIGATIVE AGENT, not a search aggregator. Hunt for startups about to break out (momentum, not maturity).

THREE PHASES. The user watches the activity feed live — make every line earn its place.

═══ P1 DISCOVERY ═══
- Pick 3-5 sources most relevant to THIS thesis (sources: search_yc, search_hackernews, search_github, search_sec_edgar, search_news, search_twitter).
- Use SHORT 2-3 word queries — NOT the verbatim thesis.
- Before each call: 1 sentence ("Hypothesis: <thesis-word> startups will surface on YC because...").
- After each result: 1 sentence synthesis ("Found 3 strong fits: X, Y, Z. Z stands out because...").
- If a source returns 0, retry ONCE with broader/different keywords before moving on.
- Exit when ≥3 sources called and ≥5 candidates identified.

═══ P2 VERIFICATION (this is what makes you agentic) ═══
Pick top 3-5 candidates BY NAME. For EACH, run at least one drill-down call:
- search_twitter("<company name>") for hiring/launches/founder
- scrape_website(<url>) for careers page + team
- search_news("<name> funding") for round confirmation

Speak about candidates by name in your thinking: "Now investigating Cardinal — checking Twitter for hiring activity..."

═══ P3 RANKING ═══
Final JSON:
\`\`\`json
{ "companies": [ {
  "name": "Company Name",
  "url": "https://...",
  "description": "what they do, 1 line",
  "score": 85,
  "reasoning": "Score 85: VERIFIED — YC W25 batch, 4 senior MLE roles on careers page (scraped), 6 hiring tweets in last 30d. RISK — team_size 0 in YC data may be stale.",
  "sources": ["yc", "twitter", "scrape"],
  "signals": {"hiring": true, "github": false, "funding": false, "launches": true}
} ] }
\`\`\`

═══ HARD RULES ═══

EVIDENCE: signal=true ONLY if a tool result contained evidence:
- hiring: search_twitter hiring tweet, scrape careers page, news re hires, OR YC isHiring:true
- github: search_github returned the company
- funding: SEC Form D, Crunchbase, news with $ amount, OR funding tweet
- launches: Show HN, YC batch, OR launch tweet
No evidence → false. Don't guess.

SCORING:
- GitHub >5k stars: cap 60. >20k stars: cap 40 (already broken out).
- Reward recent YC batches (W24+, S24+, F24+, W25+, S25+, W26+).
- Reward early indicators: seed, just-launched, just-filed, recent raise.

REASONING (MANDATORY FORMAT): "Score N: VERIFIED — <evidence with numbers>. RISK — <one risk or gap>." Must contain digits AND cite Phase 2 verification. BANNED: "promising", "strong growth potential", "indicating momentum" (when not backed by numbers).

URL: COPY EXACTLY from tool result (appears as <https://...> after the name). Never invent or slugify.`;

export async function runAgentLoop(
  thesis: string,
  criteria: ThesisCriteria,
  onEvent: (event: InvestigationEvent) => void
): Promise<ScoredCompany[]> {
  const client = getClient();
  const MAX_ITERATIONS = 12;

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Investigate this thesis: "${thesis}"

Parsed criteria:
- Industry: ${criteria.industry}
- Stage: ${criteria.stage}
- Key signals: ${criteria.signals.join(", ")}
- Keywords: ${criteria.keywords.join(", ")}

Start your investigation. Think about which sources will be most useful for this specific thesis, then begin searching.`,
    },
  ];

  const seenToolCalls = new Set<string>();
  const usedSources = new Set<string>();
  const ALL_SEARCH_SOURCES = [
    "search_yc",
    "search_hackernews",
    "search_github",
    "search_sec_edgar",
    "search_news",
    "search_twitter",
  ];
  // Verification = drill-down calls (scrape + targeted searches by company name)
  // We count any tool call made AFTER the verification phase begins.
  let phase: "discovery" | "verification" | "ranking" = "discovery";
  let verificationCallsMade = 0;
  let nudgedToVerify = false;
  let nudgedToRank = false;
  // Track candidate companies surfaced in tool results, so we can name them
  // explicitly in the verification nudge.
  const candidates = new Map<string, { sources: Set<string>; url?: string }>();

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // Rate limit buffer
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 2000));
    }

    let response;
    try {
      response = await client.chat.completions.create({
        model: TOOL_MODEL,
        messages,
        tools: toolDefinitions,
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: 8192,
      });
    } catch (err) {
      // Recover from Groq's "tool_use_failed" parser bug: the model's actual
      // output is in failed_generation. If it contains a JSON block of
      // companies, we can return those directly instead of crashing the run.
      const recovered = extractFailedGeneration(err);
      if (recovered) {
        onEvent({
          type: "status",
          message: "Recovered final ranking from Groq parser failure.",
          iteration: i + 1,
        });
        const results = parseFinalResults(recovered);
        if (results.length > 0) return results;
      }
      throw err;
    }

    const choice = response.choices[0];
    const assistantMessage = choice.message;

    // Add assistant message to history
    messages.push(assistantMessage);

    // Stream reasoning
    if (assistantMessage.content) {
      onEvent({
        type: "thinking",
        message: assistantMessage.content,
        iteration: i + 1,
      });
    }

    // If no tool calls, the agent wants to stop — check what phase we're in
    if (
      !assistantMessage.tool_calls ||
      assistantMessage.tool_calls.length === 0
    ) {
      // Discovery → Verification transition. Inject named candidates so the
      // model drills into specific companies, not generic statements.
      if (phase === "discovery" && !nudgedToVerify) {
        if (usedSources.size < 3) {
          const unused = ALL_SEARCH_SOURCES.filter((s) => !usedSources.has(s));
          messages.push({
            role: "user",
            content: `Phase 1 not complete. You've only called ${usedSources.size} source(s). Call at least 1-2 more from: ${unused.join(", ")} before moving to verification.`,
          });
          onEvent({
            type: "status",
            message: `📋 Phase 1 (Discovery) — need more sources (${usedSources.size}/3+).`,
            iteration: i + 1,
          });
          continue;
        }

        const topNames = Array.from(candidates.entries())
          .sort((a, b) => b[1].sources.size - a[1].sources.size)
          .slice(0, 5)
          .map(([n, v]) => `"${n}"${v.url ? ` (${v.url})` : ""}`);

        const nudgeMsg = topNames.length > 0
          ? `═══ DISCOVERY COMPLETE ═══
You've called ${usedSources.size} sources and surfaced these candidates:
${topNames.join(", ")}

═══ NOW: PHASE 2 — VERIFICATION ═══
Pick 3-5 of these candidates (or others you've found) and DRILL INTO EACH ONE BY NAME. For each, do at least ONE of:
- search_twitter("<company name>") to find hiring tweets, launches, founder activity
- scrape_website(<their url>) to verify hiring claims, team page, product
- search_news("<company name> funding") to check recent funding

Speak about candidates BY NAME in your thinking ("Now investigating Cardinal..."). After verification, output your final ranked JSON with evidence cites.`
          : `Phase 2: pick your top candidates from what you've found and drill into each one with search_twitter("<name>") or scrape_website(<url>) to verify before final ranking.`;

        messages.push({ role: "user", content: nudgeMsg });
        onEvent({
          type: "status",
          message: topNames.length > 0
            ? `🎯 Phase 2 (Verification) — investigating: ${topNames.slice(0, 3).join(", ")}${topNames.length > 3 ? ", ..." : ""}`
            : `🎯 Phase 2 (Verification) — drilling into top candidates`,
          iteration: i + 1,
        });
        phase = "verification";
        nudgedToVerify = true;
        continue;
      }

      // Verification → Ranking. If no verification calls were made, push back hard once.
      if (phase === "verification" && verificationCallsMade < 1 && !nudgedToRank) {
        messages.push({
          role: "user",
          content: `You skipped verification. Pick at least 2 specific candidates by name and call search_twitter, scrape_website, or search_news with each of their names. Then produce final ranking. Don't skip — this is what makes you an investigator instead of a search engine.`,
        });
        onEvent({
          type: "status",
          message: "⚠️ No verification calls yet — pushing agent to drill in.",
          iteration: i + 1,
        });
        nudgedToRank = true;
        continue;
      }

      // Allow ranking
      phase = "ranking";
      onEvent({
        type: "status",
        message: `📊 Phase 3 (Ranking) — compiling final list (${verificationCallsMade} verification call${verificationCallsMade === 1 ? "" : "s"} made).`,
        iteration: i + 1,
      });

      if (assistantMessage.content) {
        return parseFinalResults(assistantMessage.content);
      }
      break;
    }

    // Execute each tool call
    for (const toolCall of assistantMessage.tool_calls) {
      const { name } = toolCall.function;
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        args = {};
      }

      // Deduplicate: skip if we already ran this exact call
      const callKey = `${name}:${JSON.stringify(args)}`;
      if (seenToolCalls.has(callKey)) {
        const skipMsg = `Already searched this — try different parameters or finish your investigation.`;
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: skipMsg,
        });
        onEvent({
          type: "tool_result",
          message: skipMsg,
          toolName: name,
          iteration: i + 1,
        });
        continue;
      }
      seenToolCalls.add(callKey);

      // Track distinct search sources used (for phase transitions)
      if (ALL_SEARCH_SOURCES.includes(name)) {
        usedSources.add(name);
      }
      // Any tool call during verification phase counts as drill-down work.
      if (phase === "verification") {
        verificationCallsMade++;
      }

      // Stream tool call event
      onEvent({
        type: "tool_call",
        toolName: name,
        toolArgs: args,
        iteration: i + 1,
      });

      // Execute the tool
      try {
        const result = await executeTool(name, args);
        const summary = summarizeToolResult(name, result);

        // Capture candidate companies surfaced in this result so we can
        // name them in the verification nudge.
        if (result.companies) {
          for (const c of result.companies.slice(0, 8)) {
            if (!c.name) continue;
            const key = c.name;
            const entry = candidates.get(key) || { sources: new Set<string>(), url: c.url };
            entry.sources.add(name);
            if (!entry.url && c.url) entry.url = c.url;
            candidates.set(key, entry);
          }
        }

        onEvent({
          type: "tool_result",
          message: summary,
          toolName: name,
          iteration: i + 1,
        });

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: summary,
        });
      } catch (error) {
        const errMsg = `Tool error: ${error instanceof Error ? error.message : "unknown error"}`;
        onEvent({
          type: "tool_result",
          message: errMsg,
          toolName: name,
          iteration: i + 1,
        });
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: errMsg,
        });
      }
    }
  }

  // If we hit max iterations without a final result, ask for one
  onEvent({
    type: "status",
    message: "Compiling final results...",
  });

  const finalResponse = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      ...messages,
      {
        role: "user",
        content:
          "Time to wrap up. Based on everything you've found, output your final ranked list of companies as the JSON block described in your instructions. No more tool calls.",
      },
    ],
    temperature: 0.3,
    max_tokens: 4096,
  });

  const finalText = finalResponse.choices[0]?.message?.content || "";
  if (finalText) {
    onEvent({ type: "thinking", message: finalText });
  }

  return parseFinalResults(finalText);
}

interface RawCompany {
  name?: string;
  url?: string;
  description?: string;
  score?: number;
  reasoning?: string;
  sources?: string[];
  signals?: Record<string, boolean>;
}

function parseFinalResults(text: string): ScoredCompany[] {
  const companies = tryExtractCompanies(text) as RawCompany[] | null;
  if (!companies) return [];
  try {
    return companies
      .map(
        (c: RawCompany) => {
          const sources = c.sources || ["agent"];
          const sourcesLower = sources.map((s) => s.toLowerCase());
          const rawSignals = c.signals || {};

          // Validate signals against sources actually used for this company.
          // If a signal is true but no supporting source backs it, force false.
          const hiringBackers = ["linkedin", "news", "scrape", "scraper", "scrape_website", "twitter", "x", "yc", "ycombinator", "search_yc"];
          const fundingBackers = [
            "sec-edgar",
            "sec_edgar",
            "sec",
            "edgar",
            "crunchbase",
            "news",
            "twitter",
          ];
          const githubBackers = ["github"];
          const launchBackers = ["hackernews", "hacker-news", "hn", "yc", "ycombinator", "twitter"];

          const hasAny = (backers: string[]) =>
            sourcesLower.some((s) => backers.some((b) => s.includes(b)));

          const validatedSignals: Record<string, boolean> = {
            hiring: !!rawSignals.hiring && hasAny(hiringBackers),
            github: !!rawSignals.github && hasAny(githubBackers),
            funding: !!rawSignals.funding && hasAny(fundingBackers),
            launches: !!rawSignals.launches && hasAny(launchBackers),
          };

          // Low-evidence reasoning flag: short or no digits.
          let reasoning = c.reasoning || "No reasoning provided.";
          const hasDigit = /\d/.test(reasoning);
          if ((reasoning.length < 30 || !hasDigit) && !reasoning.includes("[low-evidence]")) {
            reasoning = `${reasoning} [low-evidence]`;
          }

          return {
            name: c.name || "Unknown",
            url: c.url || "",
            description: c.description || "",
            source: sources[0] || "agent",
            sourceData: {},
            signals: validatedSignals,
            score: c.score || 50,
            reasoning,
            sources,
          };
        }
      )
      .sort(
        (a: ScoredCompany, b: ScoredCompany) => b.score - a.score
      );
  } catch {
    return [];
  }
}
