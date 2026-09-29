"use client";

import { useEffect, useState } from "react";

export type InvestigationMode = "autopilot" | "manual";

export function modeStorageKey(caseId: string) {
  return `br-mode-${caseId}`;
}

/** Read Dual Mode for a case — Autopilot demotes force re-run labels; Manual keeps classic CTAs. */
export function useInvestigationMode(caseId?: string): InvestigationMode {
  const [mode, setMode] = useState<InvestigationMode>("autopilot");

  useEffect(() => {
    if (!caseId) return;
    const read = () => {
      const saved = localStorage.getItem(modeStorageKey(caseId));
      setMode(saved === "manual" ? "manual" : "autopilot");
    };
    read();
    const onStorage = (e: StorageEvent) => {
      if (e.key === modeStorageKey(caseId)) read();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("br-mode-change", read as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("br-mode-change", read as EventListener);
    };
  }, [caseId]);

  return mode;
}

export function setInvestigationMode(caseId: string, mode: InvestigationMode) {
  localStorage.setItem(modeStorageKey(caseId), mode);
  window.dispatchEvent(new Event("br-mode-change"));
}

export function forceRerunLabel(mode: InvestigationMode, manualLabel: string): string {
  return mode === "autopilot" ? `Advanced · ${manualLabel}` : manualLabel;
}
