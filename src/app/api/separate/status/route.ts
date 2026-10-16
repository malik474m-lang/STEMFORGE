import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const STEM_KEYS = ["vocals", "drums", "bass", "other", "guitar", "piano"] as const;

/** GET ?id=<predictionId> -> poll prediction status */
export async function GET(req: NextRequest) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return NextResponse.json({ error: "ai_unavailable" }, { status: 501 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  try {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: "poll_failed" }, { status: 502 });
    }
    const p = await res.json();
    const stems: Record<string, string> = {};
    if (p.status === "succeeded" && p.output && typeof p.output === "object") {
      for (const key of STEM_KEYS) {
        const url = p.output[key];
        if (typeof url === "string" && url.length > 0) {
          // route the download through our proxy to avoid CORS issues
          stems[key] = `/api/separate/file?u=${encodeURIComponent(Buffer.from(url).toString("base64url"))}`;
        }
      }
    }
    return NextResponse.json({
      status: p.status,
      logs: typeof p.logs === "string" ? p.logs.slice(-500) : null,
      error: p.error ?? null,
      stems,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
