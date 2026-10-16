#!/usr/bin/env python3
"""Локальная транскрибация STEMFORGE через faster-whisper (CPU int8)."""
import argparse
import json
import sys
import traceback


def emit(event, **data):
    print(json.dumps({"event": event, **data}, ensure_ascii=False), flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--models", required=True)
    ap.add_argument("--language", default="auto")
    args = ap.parse_args()

    from faster_whisper import WhisperModel
    emit("stage", label="Загрузка локальной модели Whisper…", progress=0.1)
    model = WhisperModel("small", device="cpu", compute_type="int8", download_root=args.models)
    emit("stage", label="Распознавание вокала…", progress=0.25)
    segments, info = model.transcribe(
        args.input,
        language=None if args.language in ("auto", "None", "") else args.language,
        vad_filter=True,
        beam_size=5,
        word_timestamps=False,
    )
    rows = []
    for seg in segments:
        text = seg.text.strip()
        if text:
            rows.append({"start": float(seg.start), "end": float(seg.end), "text": text})
            emit("progress", label=f"Распознано строк: {len(rows)}", progress=min(0.92, 0.25 + len(rows) * 0.015))
    emit("done", result={"language": info.language, "segments": rows}, progress=1.0)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        emit("error", message=str(exc), traceback=traceback.format_exc()[-4000:])
        sys.exit(1)
