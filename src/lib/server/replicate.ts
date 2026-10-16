import { NextResponse } from "next/server";

export function replicateToken(): string | null {
  return process.env.REPLICATE_API_TOKEN ?? null;
}

export function aiUnavailableResponse() {
  return NextResponse.json(
    {
      error: "ai_unavailable",
      reason: "AI-функции не активны: добавьте REPLICATE_API_TOKEN в переменные окружения",
    },
    { status: 501 },
  );
}

export async function createPrediction(
  modelSlug: string,
  input: Record<string, unknown>,
): Promise<{ jobId: string } | { error: string }> {
  const token = replicateToken();
  if (!token) return { error: "ai_unavailable" };
  try {
    const res = await fetch(`https://api.replicate.com/v1/models/${modelSlug}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait=5",
      },
      body: JSON.stringify({ input }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { error: text.slice(0, 2000) };
    }
    const data = await res.json();
    return { jobId: data.id };
  } catch (e) {
    return { error: String(e) };
  }
}

export async function fileToDataUri(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "audio/wav";
  return `data:${mime};base64,${buf.toString("base64")}`;
}
