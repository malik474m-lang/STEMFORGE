import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const API = "https://mvsep.com/api";

export async function GET() {
  return NextResponse.json({
    available: Boolean(process.env.MVSEP_API_TOKEN),
    service: "MVSep Male/Female separation",
    tokenUrl: "https://mvsep.com/user-api",
  });
}

/** Вход должен быть уже очищенным вокальным стемом, не полным миксом. */
export async function POST(req: NextRequest) {
  const token = process.env.MVSEP_API_TOKEN;
  if (!token) return NextResponse.json({ error: "MVSEP_API_TOKEN is not configured" }, { status: 501 });
  try {
    const input = await req.formData();
    const file = input.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "file_required" }, { status: 400 });
    const form = new FormData();
    form.append("audiofile", file, "clean-vocals.wav");
    form.append("api_token", token);
    form.append("sep_type", "56"); // официальный MVSep Male/Female separation (id из списка алгоритмов)
    form.append("output_format", "1"); // WAV
    form.append("is_demo", "0");
    const res = await fetch(`${API}/separation/create`, { method: "POST", body: form });
    const data = await res.json().catch(async () => ({ raw: await res.text() }));
    if (!res.ok || data.success === false) {
      return NextResponse.json({ error: "mvsep_create_failed", detail: data }, { status: 502 });
    }
    const hash = data?.data?.hash ?? data?.hash ?? data?.data;
    if (typeof hash !== "string") return NextResponse.json({ error: "mvsep_hash_missing", detail: data }, { status: 502 });
    return NextResponse.json({ hash });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
