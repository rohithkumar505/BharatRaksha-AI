"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, Mic, Send } from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const chips = [
  "Flood risk check",
  "Safe route",
  "Nearest shelter",
  "Hospital help",
  "Crop damage",
  "Relief schemes",
];

function buildReply(input: string) {
  const q = input.toLowerCase();
  if (q.includes("flood") || q.includes("risk")) {
    return "Current demo risk score for Assam is 72 (High). Heavy rainfall signals suggest moving to higher ground and checking shelters nearby. Open Live Map for safe zones.";
  }
  if (q.includes("route") || q.includes("map")) {
    return "I can guide you through Live Map: avoid marked flood zones, follow green safe routes, and use alternate evacuation paths if a road is blocked.";
  }
  if (q.includes("shelter")) {
    return "Nearest demo shelters: District School Relief Camp (1.2 km), Community Hall Zone B (2.4 km). Check occupancy before moving.";
  }
  if (q.includes("hospital") || q.includes("first aid") || q.includes("health")) {
    return "For medical help: locate nearest hospital/clinic, follow first-aid steps, and keep your emergency medical info card ready. If severe, contact local emergency services immediately.";
  }
  if (q.includes("crop") || q.includes("farm") || q.includes("agri")) {
    return "Upload a field photo for crop damage assessment, then I can guide farm flood assessment, recovery tips, insurance claim steps, and compensation documentation.";
  }
  if (q.includes("scheme") || q.includes("relief") || q.includes("government")) {
    return "I can explain disaster relief and compensation pathways, required documents, and where to apply. Tell me your state and disaster type for more specific guidance.";
  }
  return "I am BharatRaksha AI Assistant. Ask about disaster risk, safe routes, shelters, hospitals, first aid, crop damage, or government relief schemes — I can guide the full platform.";
}

export function AssistantClient() {
  const searchParams = useSearchParams();
  const initial = searchParams.get("q") || "";

  const [input, setInput] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      role: "assistant",
      content:
        "Namaste. I am BharatRaksha AI — your all-in-one disaster shield assistant. Ask in English or Hindi about risk, maps, shelters, health, farming recovery, or schemes.",
    },
  ]);

  const placeholder = useMemo(
    () => "Ask: Flood aa raha hai kya? / Nearest shelter dikhao",
    [],
  );

  async function sendMessage(text: string) {
    const content = text.trim();
    if (!content || loading) return;

    setMessages((prev) => [...prev, { role: "user", content }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content }),
      });
      const data = (await res.json()) as { reply?: string };
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply || buildReply(content) },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: buildReply(content) },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-[var(--line)] bg-[var(--bg-deep)] px-5 py-4 text-white md:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
            <Bot size={20} />
          </span>
          <div>
            <h1
              className="text-xl font-bold"
              style={{ fontFamily: "var(--font-display), sans-serif" }}
            >
              BharatRaksha AI Assistant
            </h1>
            <p className="text-sm text-white/70">
              Chat + voice-ready guidance for the full disaster platform
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[var(--line)] px-5 py-3 md:px-6">
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            className="pill bg-[#eef4f8] text-[var(--ink)]"
            onClick={() => void sendMessage(chip)}
          >
            {chip}
          </button>
        ))}
      </div>

      <div className="space-y-3 px-5 py-5 md:px-6" style={{ minHeight: 420 }}>
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${
              message.role === "user"
                ? "ml-auto bg-[var(--bg-deep)] text-white"
                : "bg-[#f3f7fb] text-[var(--ink)]"
            }`}
          >
            {message.content}
          </div>
        ))}
        {loading && (
          <div className="max-w-[85%] rounded-2xl bg-[#f3f7fb] px-4 py-3 text-sm text-[var(--muted)]">
            Assistant is thinking...
          </div>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 border-t border-[var(--line)] px-4 py-4 md:px-6"
      >
        <button type="button" className="btn btn-soft" aria-label="Voice input">
          <Mic size={18} />
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 outline-none ring-[var(--saffron)] focus:ring-2"
        />
        <button type="submit" className="btn btn-accent" disabled={loading}>
          <Send size={18} />
          Send
        </button>
      </form>
    </section>
  );
}
