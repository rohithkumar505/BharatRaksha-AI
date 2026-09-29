/**
 * Additive Night-Watch: speak critical NEW alerts while the app is open.
 * Uses existing SSE stream — does not change alert creation.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { useAlertStream } from "@/hooks/useAlertStream";

export function NightWatchToggle() {
  const [on, setOn] = useState(false);
  const onRef = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem("br-night-watch");
    if (saved === "1") {
      setOn(true);
      onRef.current = true;
    }
  }, []);

  useEffect(() => {
    onRef.current = on;
    localStorage.setItem("br-night-watch", on ? "1" : "0");
  }, [on]);

  useAlertStream((alert) => {
    if (!onRef.current) return;
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const text = `New alert: ${alert.title}. ${alert.caseNumber ?? ""}`.trim();
    const u = new SpeechSynthesisUtterance(text.slice(0, 240));
    u.lang = "en-IN";
    window.speechSynthesis.speak(u);
  });

  return (
    <button
      type="button"
      className={`btn ${on ? "btn-primary" : "btn-secondary"}`}
      style={{ fontSize: "0.75rem", padding: "0.35rem 0.6rem" }}
      onClick={() => setOn((v) => !v)}
      title="Speak critical alerts while this tab is open"
    >
      Night-Watch {on ? "ON" : "OFF"}
    </button>
  );
}
