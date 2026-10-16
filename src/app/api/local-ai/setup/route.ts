import { NextResponse } from "next/server";
import { getRuntimeStatus, startSetup } from "@/server/local-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(getRuntimeStatus());
  } catch (e) {
    return NextResponse.json({ ready: false, error: String(e) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const status = getRuntimeStatus();
    if (status.ready) return NextResponse.json({ ready: true });
    const job = startSetup();
    return NextResponse.json({ ready: false, jobId: job.id, job });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
