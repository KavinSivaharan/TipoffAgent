import { NextRequest } from "next/server";
import { getRun, getRunSightings } from "@/lib/db";
import { ScoredCompany } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "Invalid run id" }, { status: 400 });
  }

  const run = getRun(id);
  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const results: ScoredCompany[] = getRunSightings(id).map((s) => ({
    name: s.name,
    url: s.url || "",
    description: s.description || "",
    source: "history",
    sourceData: {},
    signals: JSON.parse(s.signals),
    score: s.score,
    reasoning: s.reasoning || "",
    sources: JSON.parse(s.sources),
  }));

  return Response.json({
    run: {
      id: run.id,
      thesis: run.thesis,
      resultCount: run.result_count,
      durationMs: run.duration_ms,
      createdAt: run.created_at,
    },
    results,
  });
}
