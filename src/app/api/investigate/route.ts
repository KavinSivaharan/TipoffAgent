import { NextRequest } from "next/server";
import { isApifyConfigured } from "@/lib/apify";
import { runAgentLoop } from "@/lib/claude";
import { parseThesis } from "@/lib/thesis";
import { InvestigationEvent } from "@/lib/types";
import { createRun, finishRun, saveSighting, previousSighting } from "@/lib/db";
import { notifyNewFinds } from "@/lib/notify";

export async function POST(req: NextRequest) {
  const { thesis } = await req.json();

  if (!thesis || typeof thesis !== "string") {
    return new Response(JSON.stringify({ error: "Thesis is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!process.env.GROQ_API_KEY) {
    return new Response(
      JSON.stringify({
        error:
          "GROQ_API_KEY is not set. Copy .env.example to .env.local, add your key, and restart the dev server.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: InvestigationEvent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      const startedAt = Date.now();
      try {
        // Step 1: Parse thesis
        send({ type: "status", message: "Parsing your investment thesis..." });
        const criteria = await parseThesis(thesis);
        send({
          type: "status",
          message: `Focus: ${criteria.industry} | Stage: ${criteria.stage} | Signals: ${criteria.signals.join(", ")}`,
        });

        // Step 2: Run agent loop — all thinking, tool calls, and results stream via send()
        send({ type: "status", message: "Agent starting investigation..." });
        send({
          type: "status",
          message: isApifyConfigured()
            ? "Apify Store: connected (search_news, search_twitter, search_crunchbase, scrape_website use your API token)."
            : "Apify Store: not configured — add APIFY_API_TOKEN to .env.local (see .env.example) and restart. YC, HN, GitHub, and SEC EDGAR still work.",
        });
        const results = await runAgentLoop(thesis, criteria, send);

        // Step 3: Persist the run and diff each company against its most
        // recent prior sighting — momentum (score delta, first appearance)
        // is the real tip, not the absolute score.
        const runId = createRun(thesis, criteria);
        for (const company of results) {
          const prev = previousSighting(company.name, runId);
          company.isNew = !prev;
          company.delta = prev ? company.score - prev.score : null;
          saveSighting(runId, company);
        }
        finishRun(runId, results.length, Date.now() - startedAt);

        // Step 4: Emit final results
        for (const company of results) {
          send({ type: "result", company });
        }

        await notifyNewFinds(thesis, results);

        const newCount = results.filter((c) => c.isNew).length;
        send({
          type: "done",
          message: `Investigation complete. Found ${results.length} matching companies${newCount > 0 ? ` (${newCount} never seen before)` : ""}.`,
        });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Investigation failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
