"use client";

import { useState } from "react";
import { FolderDown, History, Mic } from "lucide-react";
import ExportPanel from "./ExportPanel";
import VoicePanel from "./VoicePanel";
import ProjectsPanel from "./ProjectsPanel";

const TABS = [
  { id: "export", label: "Экспорт", icon: FolderDown },
  { id: "voice", label: "Голос", icon: Mic },
  { id: "history", label: "История", icon: History },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function RightTabs() {
  const [tab, setTab] = useState<TabId>("export");

  return (
    <div className="space-y-4">
      <div className="flex rounded-full border border-line bg-panel p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold tracking-wide transition ${
              tab === t.id
                ? "bg-acid/15 text-acid shadow-[inset_0_0_0_1px_rgba(34,211,238,0.4)]"
                : "text-dim hover:text-ink"
            }`}
          >
            <t.icon className="size-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "export" && <ExportPanel />}
      {tab === "voice" && <VoicePanel />}
      {tab === "history" && <ProjectsPanel />}
    </div>
  );
}
