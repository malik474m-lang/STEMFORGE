import { NextRequest, NextResponse } from "next/server";
import { createProject, listProjects } from "@/server/repo";

export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await listProjects();
    return NextResponse.json({ projects: rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, fileName, durationSec, sampleRate, mode, stems, exports: exportLog } = body ?? {};
    if (!title || !fileName || typeof durationSec !== "number" || !Array.isArray(stems)) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }
    const row = await createProject({
      title: String(title).slice(0, 200),
      fileName: String(fileName).slice(0, 400),
      durationSec,
      sampleRate: typeof sampleRate === "number" ? sampleRate : 44100,
      mode: mode === "local" ? "local" : mode === "ai" ? "ai" : "dsp",
      stems,
      exports: Array.isArray(exportLog) ? exportLog : [],
    });
    return NextResponse.json({ project: row });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
