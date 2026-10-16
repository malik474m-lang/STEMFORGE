import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL_SLUG = "cjwbw/demucs";

/** GET -> availability of the AI mode */
export async function GET() {
  const token = process.env.REPLICATE_API_TOKEN;
  return NextResponse.json({
    available: Boolean(token),
    provider: "replicate",
    model: MODEL_SLUG,
    reason: token
      ? null
      : "AI-режим не активен: добавьте REPLICATE_API_TOKEN в переменные окружения",
  });
}

/** POST (multipart: file) -> create a Demucs prediction, returns { jobId } */
export async function POST(req: NextRequest) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "ai_unavailable", reason: "REPLICATE_API_TOKEN is not configured" },
      { status: 501 },
    );
  }
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file_required" }, { status: 400 });
    }
    if (file.size > 60 * 1024 * 1024) {
      return NextResponse.json({ error: "file_too_large", max: "60MB" }, { status: 413 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "audio/mpeg";
    const dataUri = `data:${mime};base64,${buf.toString("base64")}`;

    const res = await fetch(`https://api.replicate.com/v1/models/${MODEL_SLUG}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait=5",
      },
      body: JSON.stringify({
        input: {
          audio: dataUri,
          model_name: "htdemucs_6s",
          shifts: 1,
          overlap: 0.25,
          clip_mode: "rescale",
          output_format: "wav",
        },
      }),
    });
    
    if (res.status === 404 || res.status === 402) {
      return NextResponse.json({
        reason: "Сервер Replicate заблокирован для вашего IP-адреса или у вас закончились бесплатные GPU-лимиты аккаунта в Replicate.",
        error: "limit_reached"
      }, { status: 402 });
    }

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: "replicate_error", detail: text.slice(0, 2000) }, { status: 502 });
    }
    const prediction = await res.json();
    return NextResponse.json({ jobId: prediction.id, status: prediction.status });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
