"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Bot,
  Send,
  Loader2,
  RefreshCw,
  BookOpen,
  Shield,
  Sparkles,
} from "lucide-react";

interface CopilotSource {
  type: string;
  ref: string;
  evidenceId?: string;
  recordRef?: string;
  confidence: number;
  excerpt?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  intent?: string;
  tool?: string;
  sources?: CopilotSource[];
}

const PRESET_QUERIES = [
  "Summarize this case",
  "Who are the most connected entities?",
  "Explain financial anomalies",
  "What communication bursts were detected?",
  "List active alerts",
];

const ACTION_PRESETS = [
  "autopilot chalao",
  "brief do",
  "clues do",
  "cyber analyze karo",
  "women safety check karo",
  "conflicts scan karo",
];

const INTENT_LABELS: Record<string, string> = {
  SUMMARY: "Case Summary",
  ENTITY_IMPORTANCE: "Entity Analysis",
  CROSS_CASE: "Cross-Case Links",
  FINANCIAL: "Financial Intel",
  COMMUNICATION: "Communication Intel",
  GEO_TIMELINE: "Geo & Timeline",
  EVIDENCE_SEARCH: "Evidence Search",
  ALERTS: "Alerts",
  GENERAL: "General",
};

interface Props {
  caseId: string;
  compact?: boolean;
}

export function CopilotPanel({ caseId, compact = false }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState<{ chunkCount: number; indexed: boolean } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadIndexStatus = useCallback(() => {
    fetch(`/api/cases/${caseId}/copilot/index`)
      .then((r) => r.json())
      .then((d) => setIndexStatus({ chunkCount: d.chunkCount ?? 0, indexed: d.indexed ?? false }));
  }, [caseId]);

  useEffect(() => {
    loadIndexStatus();
  }, [loadIndexStatus]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function reindex() {
    setIndexing(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/copilot/index`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setIndexStatus({ chunkCount: data.chunksIndexed, indexed: true });
      }
    } finally {
      setIndexing(false);
    }
  }

  async function handleAsk(q?: string) {
    const question = (q ?? query).trim();
    if (!question) return;

    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setQuery("");
    setLoading(true);

    try {
      const res = await fetch("/api/copilot/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: question, caseId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.error ?? "Query failed. Please try again." },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            intent: data.intent,
            tool: data.tool,
            sources: data.sources,
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Network error. Please check connection and retry." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", minHeight: compact ? 400 : 520 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <h2 style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Bot size={18} /> AI Investigation Copilot
          <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: 400 }}>
            RAG + action tools
          </span>
        </h2>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {indexStatus && (
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              <BookOpen size={12} style={{ display: "inline", marginRight: 4 }} />
              {indexStatus.chunkCount} knowledge chunks
            </span>
          )}
          <button className="btn" onClick={reindex} disabled={indexing} title="Re-index case knowledge">
            {indexing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
            Re-index
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          marginBottom: "1rem",
          padding: "0.5rem",
          background: "var(--bg-secondary)",
          borderRadius: 8,
          minHeight: compact ? 240 : 320,
        }}
      >
        {messages.length === 0 ? (
          <div style={{ textAlign: "center", padding: compact ? "1.5rem" : "2.5rem", color: "var(--text-secondary)" }}>
            <Sparkles size={28} style={{ margin: "0 auto 1rem", opacity: 0.6 }} />
            <p style={{ marginBottom: "0.5rem" }}>Ask questions (RAG) or give orders (tools)</p>
            <p style={{ fontSize: "0.75rem", marginBottom: "0.75rem" }}>
              Questions stay evidence-grounded. Actions like “cyber analyze karo” run live modules.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "center", marginBottom: "0.75rem" }}>
              {PRESET_QUERIES.map((q) => (
                <button
                  key={q}
                  className="btn btn-secondary"
                  style={{ fontSize: "0.75rem" }}
                  onClick={() => handleAsk(q)}
                >
                  {q}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "center" }}>
              {ACTION_PRESETS.map((q) => (
                <button
                  key={q}
                  className="btn btn-primary"
                  style={{ fontSize: "0.75rem" }}
                  onClick={() => handleAsk(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              style={{
                marginBottom: "1rem",
                padding: "0.75rem 1rem",
                borderRadius: 8,
                background: msg.role === "user" ? "var(--bg-card)" : "rgba(59,130,246,0.08)",
                marginLeft: msg.role === "assistant" ? 0 : "1.5rem",
                marginRight: msg.role === "user" ? 0 : "1.5rem",
                border: msg.role === "assistant" ? "1px solid rgba(59,130,246,0.2)" : "1px solid var(--border)",
              }}
            >
              <p style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                {msg.role === "user" ? "You" : "Bharat Raksha AI"}
                {msg.intent && (
                  <span className="badge badge-new" style={{ marginLeft: "0.5rem", fontSize: "0.65rem" }}>
                    {msg.tool ? `Tool: ${msg.tool}` : INTENT_LABELS[msg.intent] ?? msg.intent}
                  </span>
                )}
              </p>
              <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.65, fontSize: "0.9rem" }}>{msg.content}</p>
              {msg.sources && msg.sources.length > 0 && (
                <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
                  <p style={{ fontSize: "0.7rem", fontWeight: 600, marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: 4 }}>
                    <Shield size={12} /> Sources ({msg.sources.length})
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    {msg.sources.slice(0, 6).map((s, j) => (
                      <div
                        key={j}
                        style={{
                          fontSize: "0.7rem",
                          padding: "0.35rem 0.5rem",
                          background: "var(--bg-primary)",
                          borderRadius: 4,
                          borderLeft: "2px solid var(--accent)",
                        }}
                      >
                        <span style={{ color: "var(--accent)", fontWeight: 500 }}>{s.type}</span>
                        {s.recordRef && <span style={{ color: "var(--text-secondary)" }}> — {s.recordRef}</span>}
                        <span style={{ color: "var(--text-secondary)", marginLeft: 6 }}>
                          ({Math.round(s.confidence * 100)}%)
                        </span>
                        {s.excerpt && (
                          <p style={{ color: "var(--text-secondary)", marginTop: 2, fontSize: "0.65rem" }}>
                            {String(s.excerpt).slice(0, 120)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-secondary)", padding: "0.5rem" }}>
            <Loader2 size={16} className="spin" />
            Retrieving context and synthesizing answer...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask a question OR type: brief do / cyber analyze karo"
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAsk()}
          disabled={loading}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" onClick={() => handleAsk()} disabled={loading || !query.trim()}>
          {loading ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}
