import { listRuns, recentTopSightings } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const runs = listRuns(50).map((r) => ({
    id: r.id,
    thesis: r.thesis,
    resultCount: r.result_count,
    durationMs: r.duration_ms,
    createdAt: r.created_at,
  }));

  const recentFinds = recentTopSightings(6).map((s) => ({
    name: s.name,
    score: s.score,
    url: s.url || "",
    description: s.description || "",
    signals: JSON.parse(s.signals) as Record<string, boolean>,
    seenAt: s.created_at,
  }));

  return Response.json({ runs, recentFinds });
}
