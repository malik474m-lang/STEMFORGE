import { NextRequest, NextResponse } from "next/server";
import { readStem } from "@/server/local-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ job: string; stem: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { job, stem } = await ctx.params;
  const file = readStem(job, stem);
  if (!file) return NextResponse.json({ error: "stem_not_found" }, { status: 404 });
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(file.length),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
