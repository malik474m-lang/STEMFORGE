import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getRuntimeStatus, jobsDir, startTranscription } from "@/server/local-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    if (!getRuntimeStatus().ready) return NextResponse.json({ error: "local_ai_not_installed" }, { status: 409 });
    const form = await req.formData();
    const file = form.get("file");
    const language = String(form.get("language") || "auto");
    if (!(file instanceof File)) return NextResponse.json({ error: "file_required" }, { status: 400 });
    const uploadId = crypto.randomUUID();
    const folder = path.join(jobsDir(), uploadId);
    await mkdir(folder, { recursive: true });
    const input = path.join(folder, "transcribe.wav");
    await writeFile(input, new Uint8Array(await file.arrayBuffer()));
    const job = startTranscription(input, language);
    return NextResponse.json({ jobId: job.id });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
