import { NextRequest, NextResponse } from "next/server";
import { aiUnavailableResponse, createPrediction, replicateToken } from "@/lib/server/replicate";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = "lucataco/ace-step";

/**
 * POST (json: { tags, lyrics, seconds, instrumental }) → { jobId }
 * Генерация песни с вокалом по тексту (ACE-Step).
 */
export async function POST(req: NextRequest) {
  if (!replicateToken()) return aiUnavailableResponse();
  try {
    const body = await req.json();
    const tags = String(body.tags ?? "").slice(0, 500);
    const lyrics = String(body.lyrics ?? "").slice(0, 4000);
    const seconds = Math.max(30, Math.min(190, Number(body.seconds) || 120));
    const instrumental = Boolean(body.instrumental);

    const result = await createPrediction(MODEL, {
      tags: tags || "pop, emotional, modern production",
      lyrics: instrumental ? "" : lyrics,
      duration: seconds,
      steps: 60,
      seed: -1,
      guidance_scale: 15,
      scheduler: "euler",
      guidance_type: "apg",
      granularity_scale: 10,
      tag_guidance_scale: 5,
      lyric_guidance_scale: 1.5,
      guidance_interval: 0.5,
      guidance_interval_decay: 0,
      min_guidance_scale: 3,
      instrumental,
      vocal: !instrumental,
      use_enhance: true,
    });
    if ("error" in result) {
      return NextResponse.json({ error: "replicate_error", detail: result.error }, { status: 502 });
    }
    return NextResponse.json({ jobId: result.jobId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
