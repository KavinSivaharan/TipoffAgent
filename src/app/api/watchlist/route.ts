import { NextRequest } from "next/server";
import { addToWatchlist, listWatchlist, removeFromWatchlist } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ watchlist: listWatchlist() });
}

export async function POST(req: NextRequest) {
  const { thesis } = await req.json();
  if (!thesis || typeof thesis !== "string" || !thesis.trim()) {
    return Response.json({ error: "Thesis is required" }, { status: 400 });
  }
  return Response.json({ item: addToWatchlist(thesis) });
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  removeFromWatchlist(id);
  return Response.json({ ok: true });
}
