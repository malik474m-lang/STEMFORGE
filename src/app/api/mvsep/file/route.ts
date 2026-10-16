import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const encoded = req.nextUrl.searchParams.get("u");
  if (!encoded) return NextResponse.json({ error: "url_required" }, { status: 400 });
  try {
    const url = Buffer.from(encoded, "base64url").toString("utf8");
    const host = new URL(url).hostname;
    if (!(host === "mvsep.com" || host.endsWith(".mvsep.com"))) {
      return NextResponse.json({ error: "forbidden_host" }, { status: 403 });
    }
    const res = await fetch(url);
    if (!res.ok) return NextResponse.json({ error: "download_failed" }, { status: 502 });
    const data = new Uint8Array(await res.arrayBuffer());
    return new NextResponse(data, { headers: { "Content-Type": res.headers.get("content-type") || "audio/wav" } });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
