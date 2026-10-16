import { NextRequest, NextResponse } from "next/server";
import { aiUnavailableResponse, createPrediction, fileToDataUri, replicateToken } from "@/lib/server/replicate";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = "vaibhavs10/incredibly-fast-whisper";

/** POST (multipart: file, language?) → { jobId } — распознавание текста с таймкодами. */
export async function POST(req: NextRequest) {
  if (!replicateToken()) return aiUnavailableResponse();
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file_required" }, { status: 400 });
    }
    if (file.size > 60 * 1024 * 1024) {
      return NextResponse.json({ error: "file_too_large", max: "60MB" }, { status: 413 });
    }
    const language = String(form.get("language") || "None");
    const dataUri = await fileToDataUri(file);

    const result = await createPrediction(MODEL, {
      audio: dataUri,
      task: "transcribe",
      timestamp: "chunk",
      chunk_length: 30,
      batch_size: 64,
      language: language === "None" ? "None" : language,
    });
    if ("error" in result) {
      return NextResponse.json({ error: "replicate_error", detail: result.error }, { status: 502 });
    }
    return NextResponse.json({ jobId: result.jobId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
