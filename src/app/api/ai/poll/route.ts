import { NextRequest, NextResponse } from "next/server";
import { replicateToken } from "@/lib/server/replicate";

export const runtime = "nodejs";

/**
 * Универсальный опрос предсказания Replicate.
 * GET ?id=... → { status, output, logs, error }
 */
export async function GET(req: NextRequest) {
  const token = replicateToken();
  if (!token) return NextResponse.json({ error: "ai_unavailable" }, { status: 501 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  try {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: "poll_failed" }, { status: 502 });
    const p = await res.json();
    return NextResponse.json({
      status: p.status,
      output: p.output ?? null,
      logs: typeof p.logs === "string" ? p.logs.slice(-400) : null,
      error: p.error ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
