import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const hash = req.nextUrl.searchParams.get("hash");
  if (!hash) return NextResponse.json({ error: "hash_required" }, { status: 400 });
  try {
    const res = await fetch(`https://mvsep.com/api/separation/get?hash=${encodeURIComponent(hash)}`, { cache: "no-store" });
    const raw = await res.json();
    const data = raw?.data ?? raw;
    const statusRaw = String(data?.status ?? raw?.status ?? "waiting").toLowerCase();
    const done = ["done", "completed", "finished", "success"].some((x) => statusRaw.includes(x));
    const failed = ["error", "failed", "cancel"].some((x) => statusRaw.includes(x));
    const sourceFiles = data?.files ?? {};
    const entries: Array<[string, unknown]> = Array.isArray(sourceFiles)
      ? sourceFiles.map((x: unknown, i: number) => [String(i), x])
      : sourceFiles && typeof sourceFiles === "object"
        ? Object.entries(sourceFiles)
        : [];
    const files: Record<string, string> = {};
    for (const [key, rawItem] of entries) {
      const item = rawItem && typeof rawItem === "object" ? rawItem as Record<string, unknown> : {};
      const name = `${key} ${String(item.name ?? item.filename ?? item.label ?? "")}`.toLowerCase();
      const rawUrl = typeof rawItem === "string" ? rawItem : item.url ?? item.download ?? item.link;
      if (typeof rawUrl !== "string") continue;
      const url = rawUrl.startsWith("http") ? rawUrl : new URL(rawUrl, "https://mvsep.com").toString();
      // female проверяем первой: строка female содержит подстроку male
      if (name.includes("female") || name.includes("жен")) files.female = url;
      else if (name.includes("male") || name.includes("муж")) files.male = url;
    }
    return NextResponse.json({ status: failed ? "failed" : done ? "done" : "running", files, detail: failed ? data : undefined });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
