#!/usr/bin/env python3
"""
STEMFORGE local ML worker.
Настоящее source separation через python-audio-separator:
- clean: BS-RoFormer -> vocals + instrumental
- six: HTDemucs 6s -> vocals, drums, bass, guitar, piano, other
- pro: BS-RoFormer для чистых vocal/instrumental + HTDemucs для инструментов

Протокол stdout: одна JSON-строка на событие.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import traceback
from pathlib import Path


def emit(event: str, **data):
    print(json.dumps({"event": event, **data}, ensure_ascii=False), flush=True)


def detect_stem(name: str) -> str | None:
    n = name.lower()
    aliases = {
        "vocals": ["vocals", "vocal"],
        "instrumental": ["instrumental", "no_vocals", "accompaniment"],
        "drums": ["drums", "drum"],
        "bass": ["bass"],
        "guitar": ["guitar"],
        "piano": ["piano"],
        "other": ["other"],
    }
    for stem, words in aliases.items():
        if any(f"({w})" in n or f"_{w}." in n or f"-{w}." in n for w in words):
            return stem
    return None


def run_model(input_file: Path, output_dir: Path, model: str, model_dir: Path, prefix: str):
    from audio_separator.separator import Separator

    emit("stage", label=f"Загрузка модели {model}", progress=0.08)
    separator = Separator(
        log_level=20,
        model_file_dir=str(model_dir),
        output_dir=str(output_dir),
        output_format="WAV",
        normalization_threshold=0.95,
    )
    separator.load_model(model_filename=model)
    emit("stage", label=f"Разделение: {model}", progress=0.18)
    files = separator.separate(str(input_file))
    mapped = {}
    for item in files:
        p = Path(item)
        if not p.is_absolute():
            p = output_dir / p.name
        stem = detect_stem(p.name)
        if stem and p.exists():
            dest = output_dir / f"{prefix}{stem}.wav"
            if p.resolve() != dest.resolve():
                if dest.exists():
                    dest.unlink()
                shutil.move(str(p), str(dest))
            mapped[stem] = dest
            emit("stem", stem=stem, path=str(dest))
    return mapped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--models", required=True)
    ap.add_argument("--mode", choices=["clean", "six", "pro"], default="pro")
    args = ap.parse_args()

    input_file = Path(args.input).resolve()
    output_dir = Path(args.output).resolve()
    model_dir = Path(args.models).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    model_dir.mkdir(parents=True, exist_ok=True)

    # Лучший доступный 2-stem vocal model из реестра audio-separator.
    clean_model = os.environ.get(
        "STEMFORGE_VOCAL_MODEL",
        "model_bs_roformer_ep_317_sdr_12.9755.ckpt",
    )
    six_model = os.environ.get("STEMFORGE_6STEM_MODEL", "htdemucs_6s.yaml")

    result = {}
    if args.mode in ("clean", "pro"):
        clean = run_model(input_file, output_dir, clean_model, model_dir, "clean-")
        for stem in ("vocals", "instrumental"):
            if stem in clean:
                final = output_dir / f"{stem}.wav"
                shutil.copy2(clean[stem], final)
                result[stem] = str(final)
        emit("stage", label="Чистый вокал отделён", progress=0.52 if args.mode == "pro" else 0.92)

    if args.mode in ("six", "pro"):
        six = run_model(input_file, output_dir, six_model, model_dir, "demucs-")
        for stem in ("drums", "bass", "guitar", "piano", "other"):
            if stem in six:
                final = output_dir / f"{stem}.wav"
                shutil.copy2(six[stem], final)
                result[stem] = str(final)
        if args.mode == "six" and "vocals" in six:
            final = output_dir / "vocals.wav"
            shutil.copy2(six["vocals"], final)
            result["vocals"] = str(final)
        emit("stage", label="Инструменты разделены", progress=0.94)

    if not result:
        raise RuntimeError("Модель не создала распознаваемых WAV-стемов")

    emit("done", stems=result, progress=1.0)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        emit("error", message=str(exc), traceback=traceback.format_exc()[-4000:])
        sys.exit(1)
