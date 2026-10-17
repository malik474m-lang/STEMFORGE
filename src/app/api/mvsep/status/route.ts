import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STEM_WORDS: Record<string, string[]> = {
  vocals: ["vocals", "vocal"],
  instrumental: ["instrumental", "accompaniment", "no_vocals"],
  drums: ["drums", "drum"],
  bass: ["bass"],
  guitar: ["guitar"],
  piano: ["piano"],
  other: ["other"],
  female: ["female"],
  male: ["male"],
};

/** GET ?hash=... — универсальный опрос результата MVSep с распознаванием имён стемов. */
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
      const item = rawItem && typeof rawItem === "object" ? (rawItem as Record<string, unknown>) : {};
      const name = `${key} ${String(item.name ?? item.filename ?? item.label ?? "")}`.toLowerCase();
      const rawUrl = typeof rawItem === "string" ? rawItem : item.url ?? item.download ?? item.link;
      if (typeof rawUrl !== "string") continue;
      const url = rawUrl.startsWith("http") ? rawUrl : new URL(rawUrl, "https://mvsep.com").toString();
      // female важнее male (подстрока), затем остальные
      if (name.includes("female")) { files.female = url; continue; }
      if (name.includes("male")) { files.male = url; continue; }
      for (const [stem, words] of Object.entries(STEM_WORDS)) {
        if (stem === "female" || stem === "male") continue;
        if (words.some((w) => name.includes(w)) && !files[stem]) {
          files[stem] = url;
          break;
        }
      }
    }

    return NextResponse.json({
      status: failed ? "failed" : done ? "done" : "running",
      files,
      detail: failed ? data : undefined,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
