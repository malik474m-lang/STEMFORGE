import { NextRequest, NextResponse } from "next/server";
import { deleteLyrics, updateLyrics } from "@/server/repo";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await deleteLyrics(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const patch: Record<string, unknown> = {};
    if (Array.isArray(body.lines)) patch.lines = body.lines;
    if (typeof body.plainText === "string") patch.plainText = body.plainText.slice(0, 20000);
    if (typeof body.title === "string") patch.title = body.title.slice(0, 200);
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
    }
    const row = await updateLyrics(id, patch);
    return NextResponse.json({ lyrics: row });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
