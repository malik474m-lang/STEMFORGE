import { NextRequest, NextResponse } from "next/server";
import { createLyrics, listLyrics } from "@/server/repo";

export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await listLyrics();
    return NextResponse.json({ lyrics: rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, fileName, plainText, lines, projectId } = body ?? {};
    if (!title || !fileName || !Array.isArray(lines)) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }
    const row = await createLyrics({
      title: String(title).slice(0, 200),
      fileName: String(fileName).slice(0, 400),
      plainText: String(plainText ?? "").slice(0, 20000),
      lines,
      projectId: typeof projectId === "string" ? projectId : null,
    });
    return NextResponse.json({ lyrics: row });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
