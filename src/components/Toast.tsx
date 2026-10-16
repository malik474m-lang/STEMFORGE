"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BellRing } from "lucide-react";
import { useStudio } from "@/lib/store";

export default function Toast() {
  const toast = useStudio((s) => s.toast);
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-acid/40 bg-panel/90 px-5 py-3 text-[13px] font-semibold text-ink shadow-[0_16px_50px_-12px_rgba(34,211,238,0.35)] backdrop-blur-xl"
        >
          <BellRing className="size-4 text-acid" />
          {toast}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
