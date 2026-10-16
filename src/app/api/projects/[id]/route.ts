import { NextRequest, NextResponse } from "next/server";
import { deleteProject, updateProject } from "@/server/repo";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await deleteProject(id);
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
    if (typeof body.title === "string") patch.title = body.title.slice(0, 200);
    if (typeof body.note === "string") patch.note = body.note.slice(0, 2000);
    if (Array.isArray(body.stems)) patch.stems = body.stems;
    if (Array.isArray(body.exports)) patch.exports = body.exports;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
    }
    const row = await updateProject(id, patch);
    return NextResponse.json({ project: row });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
