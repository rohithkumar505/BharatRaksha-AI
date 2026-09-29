"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Volume2 } from "lucide-react";
import { extractCasesList } from "@/lib/api-list";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
};

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    SpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

/** Global Voice Partner dock — Web Speech STT/TTS + live copilot agent tools. */
export function VoicePartnerDock() {
  const [open, setOpen] = useState(false);
  const [caseId, setCaseId] = useState("");
  const [cases, setCases] = useState<Array<{ id: string; caseNumber: string }>>([]);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState("hi-IN");
  const [error, setError] = useState("");
  const recogRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    fetch("/api/cases?limit=30")
      .then((r) => r.json())
      .then((d) => {
        const list = extractCasesList<{ id: string; caseNumber: string }>(d);
        setCases(list);
        if (list[0]) setCaseId(list[0].id);
      })
      .catch(() => undefined);
  }, []);

  function speak(text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 600));
    u.lang = lang;
    window.speechSynthesis.speak(u);
  }

  async function ask(text: string) {
    if (!caseId || !text.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/copilot/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, query: text }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Query failed");
      setAnswer(j.answer ?? "");
      speak(String(j.answer ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleListen() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError("Speech recognition not supported in this browser. Type in Copilot instead.");
      return;
    }
    if (listening && recogRef.current) {
      recogRef.current.stop();
      setListening(false);
      return;
    }
    const recog = new SR();
    recog.lang = lang;
    recog.continuous = false;
    recog.interimResults = true;
    recog.onresult = (ev) => {
      let finalText = "";
      for (let i = 0; i < ev.results.length; i++) {
        const row = ev.results[i];
        if (row.isFinal) finalText += row[0].transcript;
        else setTranscript(row[0].transcript);
      }
      if (finalText) {
        setTranscript(finalText);
        void ask(finalText);
      }
    };
    recog.onerror = (ev) => {
      setError(ev.error || "Mic error");
      setListening(false);
    };
    recog.onend = () => setListening(false);
    recogRef.current = recog;
    recog.start();
    setListening(true);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Voice Partner"
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          zIndex: 90,
          width: 52,
          height: 52,
          borderRadius: "50%",
          border: "1px solid var(--border)",
          background: "var(--saffron)",
          color: "#111",
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        }}
      >
        <Mic size={20} />
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 90,
        width: 340,
        maxWidth: "calc(100vw - 32px)",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "0.9rem",
        boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <strong style={{ fontSize: "0.9rem" }}>Voice Partner</strong>
        <button type="button" className="btn btn-secondary" style={{ padding: "0.2rem 0.5rem" }} onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <select value={caseId} onChange={(e) => setCaseId(e.target.value)} style={{ marginBottom: "0.5rem" }}>
        {cases.map((c) => (
          <option key={c.id} value={c.id}>
            {c.caseNumber}
          </option>
        ))}
      </select>
      <select value={lang} onChange={(e) => setLang(e.target.value)} style={{ marginBottom: "0.5rem" }}>
        <option value="hi-IN">Hindi (hi-IN)</option>
        <option value="en-IN">English (en-IN)</option>
        <option value="en-US">English (en-US)</option>
      </select>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <button type="button" className="btn btn-primary" onClick={toggleListen} disabled={busy || !caseId}>
          {listening ? <Square size={14} /> : <Mic size={14} />}
          {listening ? "Stop" : "Hold talk"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => speak(answer)} disabled={!answer}>
          <Volume2 size={14} /> Replay
        </button>
      </div>
      <textarea
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="Or type: cyber analyze karo / clues do / autopilot chalao"
        rows={2}
        style={{ marginBottom: "0.5rem" }}
      />
      <button
        type="button"
        className="btn btn-secondary"
        style={{ width: "100%", marginBottom: "0.5rem" }}
        disabled={busy || !transcript.trim() || !caseId}
        onClick={() => ask(transcript)}
      >
        {busy ? "Working…" : "Send to AI"}
      </button>
      {error && <p style={{ color: "var(--danger)", fontSize: "0.75rem" }}>{error}</p>}
      {answer && (
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", maxHeight: 140, overflow: "auto" }}>{answer}</p>
      )}
    </div>
  );
}
