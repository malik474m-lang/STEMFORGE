import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/** GET ?u=<base64url(url)> -> proxies a stem file from replicate.delivery */
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u");
  if (!u) return NextResponse.json({ error: "u_required" }, { status: 400 });
  let url: string;
  try {
    url = Buffer.from(u, "base64url").toString("utf8");
    const host = new URL(url).hostname;
    if (!host.endsWith("replicate.delivery")) {
      return NextResponse.json({ error: "forbidden_host" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "bad_url" }, { status: 400 });
  }
  try {
    const upstream = await fetch(url);
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "upstream_failed" }, { status: 502 });
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(buf.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
