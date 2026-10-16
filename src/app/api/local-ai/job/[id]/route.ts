import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/server/local-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "job_not_found" }, { status: 404 });
  const stems = job.stems
    ? Object.fromEntries(Object.keys(job.stems).map((s) => [s, `/api/local-ai/file/${id}/${s}`]))
    : undefined;
  return NextResponse.json({ ...job, stems });
}
