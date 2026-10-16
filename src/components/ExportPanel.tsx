"use client";

import { Check, FileArchive, FolderDown, Save } from "lucide-react";
import { FORMAT_LABELS, useStudio, type ExportFormat } from "@/lib/store";

const FORMATS: ExportFormat[] = ["wav16", "wav24", "wav32", "mp3_320", "mp3_192", "mp3_128"];

export default function ExportPanel() {
  const stems = useStudio((s) => s.stems);
  const exportFormat = useStudio((s) => s.exportFormat);
  const setExportFormat = useStudio((s) => s.setExportFormat);
  const normalizeExport = useStudio((s) => s.normalizeExport);
  const setNormalizeExport = useStudio((s) => s.setNormalizeExport);
  const exportSelection = useStudio((s) => s.exportSelection);
  const toggleExportSelection = useStudio((s) => s.toggleExportSelection);
  const exporting = useStudio((s) => s.exporting);
  const exportLog = useStudio((s) => s.exportLog);
  const exportAll = useStudio((s) => s.exportAll);
  const saveProject = useStudio((s) => s.saveProject);

  const selectedCount = stems.filter((s) => exportSelection[s.id]).length;

  return (
    <div className="glass noise relative overflow-hidden rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[13px] font-bold tracking-[0.16em] text-white uppercase">
          Экспорт дорожек
        </h3>
        <button
          onClick={() => void saveProject()}
          title="Сохранить настройки микшера в историю проектов"
          className="btn-ghost flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-dim hover:text-acid"
        >
          <Save className="size-3.5" />
          Сохранить проект
        </button>
      </div>

      {/* формат */}
      <p className="mt-5 text-[10px] font-bold tracking-[0.18em] text-dim uppercase">Формат</p>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {FORMATS.map((f) => (
          <button
            key={f}
            onClick={() => setExportFormat(f)}
            className={`rounded-lg px-2 py-2 text-[10.5px] font-bold tracking-wide transition ${
              exportFormat === f
                ? "bg-acid/15 text-acid shadow-[inset_0_0_0_1px_rgba(34,211,238,0.5)]"
                : "border border-line text-dim hover:border-acid/30 hover:text-ink"
            }`}
          >
            {FORMAT_LABELS[f]}
          </button>
        ))}
      </div>

      {/* нормализация */}
      <button
        onClick={() => setNormalizeExport(!normalizeExport)}
        className="mt-4 flex w-full items-center justify-between rounded-xl border border-line bg-void/40 px-3.5 py-3 text-left transition hover:border-acid/30"
      >
        <span>
          <span className="block text-[12px] font-bold text-ink">Нормализация под −1 дБ</span>
          <span className="block text-[10.5px] text-dim">защита от клиппинга при экспорте</span>
        </span>
        <span
          className={`relative h-5 w-9 shrink-0 rounded-full transition ${
            normalizeExport ? "bg-acid/80" : "bg-white/12"
          }`}
        >
          <span
            className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${
              normalizeExport ? "left-[18px]" : "left-0.5"
            }`}
          />
        </span>
      </button>

      {/* выбор дорожек */}
      <p className="mt-4 text-[10px] font-bold tracking-[0.18em] text-dim uppercase">
        Дорожки в архив · {selectedCount}/{stems.length}
      </p>
      <div className="mt-2 space-y-1.5">
        {stems.map((s) => {
          const on = Boolean(exportSelection[s.id]);
          return (
            <button
              key={s.id}
              onClick={() => toggleExportSelection(s.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-[12px] font-semibold transition ${
                on ? "border-line bg-void/40 text-ink" : "border-transparent bg-transparent text-dim/50"
              }`}
            >
              <span
                className="grid size-4 place-items-center rounded border transition"
                style={{
                  borderColor: on ? s.color : "rgba(148,163,255,0.25)",
                  background: on ? `${s.color}26` : "transparent",
                }}
              >
                {on && <Check className="size-3" style={{ color: s.color }} strokeWidth={3} />}
              </span>
              <span className="size-1.5 rounded-full" style={{ background: s.color }} />
              {s.name}
              {s.enhance && (
                <span className="ml-auto rounded-full bg-lilac/15 px-2 py-px text-[8.5px] font-bold tracking-wider text-lilac uppercase">
                  улучшено
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* кнопка ZIP */}
      <button
        onClick={() => void exportAll()}
        disabled={exporting || selectedCount === 0}
        className="btn-acid mt-5 flex w-full items-center justify-center gap-2.5 rounded-2xl px-5 py-4 font-display text-[12px] font-bold tracking-[0.12em] uppercase"
      >
        <FileArchive className="size-4.5" strokeWidth={2.4} />
        {exporting ? "Экспорт…" : "Скачать всё (ZIP)"}
      </button>

      {/* прогресс экспорта */}
      {exportLog.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          {exportLog.map((item) => (
            <div key={item.id} className="flex items-center gap-2.5">
              <FolderDown className={`size-3.5 shrink-0 ${item.done && !item.error ? "text-lime-x" : "text-acid"}`} />
              <span className="w-24 truncate text-[11px] font-semibold text-ink">{item.label}</span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/8">
                <div
                  className={`h-full rounded-full transition-[width] duration-200 ${
                    item.error ? "bg-rose" : item.done ? "bg-lime-x" : "bg-acid"
                  }`}
                  style={{ width: `${item.error ? 100 : Math.round(item.pct * 100)}%` }}
                />
              </div>
              <span className="w-9 text-right text-[10px] font-bold text-dim tabular-nums">
                {item.error ? "ошибк." : item.done ? "✓" : `${Math.round(item.pct * 100)}%`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
