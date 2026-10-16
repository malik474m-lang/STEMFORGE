import { NextRequest, NextResponse } from "next/server";
import { aiUnavailableResponse, fileToDataUri, replicateToken } from "@/lib/server/replicate";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Наиболее стабильные, доступные голосовые модели в Replicate.
 * Если ваша учетная запись Replicate имеет ограниченные бесплатные лимиты, 
 * мы сможем определить их статус через API, чтобы избежать жесткого 404.
 */
export async function POST(req: NextRequest) {
  if (!replicateToken()) return aiUnavailableResponse();
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file_required" }, { status: 400 });
    }
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "file_too_large_for_free", phrase: "Бесплатные модели не берут более 25 МБ" }, { status: 413 });
    }

    const modelSlug = "zsxkib/realistic-voice-cloning";
    const dataUri = await fileToDataUri(file);

    const res = await fetch(`https://api.replicate.com/v1/models/${modelSlug}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${replicateToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: {
          audio: dataUri,
          rvc_model: "CUSTOM", // default fallback behavior
        },
      }),
    });

    if (res.status === 404 || res.status === 403) {
      return NextResponse.json({
        reason: "Ваш аккаунт Replicate исчерпал бесплатные лимиты обращения к GPU или к этой модели. Зарегистрируйте бесплатную карту банка на сайте replicate.com, или подождите до следующего месяца. Альтернативно используйте уникальный стабильный DSP-маску, которая была добавлена прямо в браузер!",
        error: "limit_reached"
      }, { status: 402 });
    }

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: "API error", detail: text }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json({ jobId: data.id });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
