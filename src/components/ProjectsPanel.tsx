"use client";

import { Cpu, History, Trash2, Wand2, Zap } from "lucide-react";
import { useStudio } from "@/lib/store";
import { formatTime } from "@/lib/format";

export default function ProjectsPanel() {
  const projects = useStudio((s) => s.projects);
  const loading = useStudio((s) => s.projectsLoading);
  const deleteProject = useStudio((s) => s.deleteProject);
  const applyProject = useStudio((s) => s.applyProject);
  const savedProjectId = useStudio((s) => s.savedProjectId);

  return (
    <div className="glass noise relative overflow-hidden rounded-3xl p-5">
      <div className="flex items-center gap-2">
        <History className="size-4 text-acid" />
        <h3 className="font-display text-[13px] font-bold tracking-[0.16em] text-white uppercase">
          История проектов
        </h3>
        <span className="ml-auto rounded-full border border-line px-2 py-0.5 text-[10px] font-bold text-dim">
          {projects.length}
        </span>
      </div>

      <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
        {loading && <p className="text-[12px] text-dim">Загрузка…</p>}
        {!loading && projects.length === 0 && (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[12px] leading-relaxed text-dim">
            Пусто. Разделите трек и сохраните проект — он появится здесь вместе с настройками микшера и журналом экспортов.
          </p>
        )}
        {projects.map((p) => (
          <div
            key={p.id}
            className={`hairline group rounded-xl bg-void/40 p-3.5 transition ${
              savedProjectId === p.id ? "border-acid/50 bg-acid/5" : ""
            }`}
          >
            <div className="flex items-start gap-2">
              <span
                className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${
                  p.mode === "local" ? "bg-lime-x/15 text-lime-x" : p.mode === "ai" ? "bg-lilac/15 text-lilac" : "bg-acid/15 text-acid"
                }`}
                title={p.mode === "local" ? "Локальный AI (RoFormer + Demucs)" : p.mode === "ai" ? "Облачный AI" : "DSP-предпросмотр"}
              >
                {p.mode === "local" || p.mode === "ai" ? <Cpu className="size-3.5" /> : <Zap className="size-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-white">{p.title}</p>
                <p className="truncate text-[10.5px] text-dim">
                  {p.fileName} · {formatTime(p.durationSec)} · {p.stems.length} дор.
                  {p.exports.length > 0 && ` · экспортов: ${p.exports.length}`}
                </p>
                <p className="mt-0.5 text-[10px] text-dim/70">
                  {new Date(p.createdAt).toLocaleString("ru-RU", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => applyProject(p)}
                  title="Применить настройки этого проекта к открытому треку"
                  className="btn-ghost grid size-7 place-items-center rounded-lg text-dim hover:text-acid"
                >
                  <Wand2 className="size-3.5" />
                </button>
                <button
                  onClick={() => void deleteProject(p.id)}
                  title="Удалить из истории"
                  className="btn-ghost grid size-7 place-items-center rounded-lg text-dim hover:text-rose"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
