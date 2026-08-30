import Link from "next/link";
import { TOTAL_FEATURES, modules } from "@/lib/features";
import { riskDemo } from "@/lib/demo-data";
import { Bot, Shield, TriangleAlert, Waves } from "lucide-react";

export default function HomePage() {
  return (
    <div className="shell space-y-6">
      <section className="card overflow-hidden p-6 md:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.25fr_0.85fr]">
          <div>
            <span className="pill bg-[#fff1e4] text-[var(--saffron-dark)]">
              <Waves size={14} />
              PS3 · 82 features · 11 modules · software-only
            </span>
            <h1
              className="mt-4 max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-5xl"
              style={{ fontFamily: "var(--font-display), sans-serif" }}
            >
              BharatRaksha AI
            </h1>
            <p className="mt-3 max-w-2xl text-lg text-[var(--muted)]">
              The AI Shield for Every Disaster. One multilingual AI assistant that
              can run prediction, maps, emergency response, healthcare, agriculture
              recovery, computer vision, community tools, and government coordination.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/assistant" className="btn btn-primary">
                <Bot size={18} />
                Talk to AI Assistant
              </Link>
              <Link href="/features" className="btn btn-soft">
                <Shield size={18} />
                Browse all {TOTAL_FEATURES} features
              </Link>
            </div>
          </div>

          <div className="rounded-[24px] bg-[var(--bg-deep)] p-5 text-white">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-white/70">Disaster Risk Score</p>
                <p className="mt-1 text-5xl font-bold">{riskDemo.overallScore}</p>
                <p className="mt-1 text-sm font-semibold text-[var(--saffron)]">
                  {riskDemo.level} · {riskDemo.location}
                </p>
              </div>
              <span className="pill bg-white/10 text-white">
                <TriangleAlert size={14} />
                Live demo
              </span>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
              {riskDemo.hazards.slice(0, 3).map((h) => (
                <div key={h.name} className="rounded-2xl bg-white/10 px-2 py-3">
                  <p className="font-bold">{h.score}</p>
                  <p className="mt-1 opacity-80">{h.name}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((module, index) => (
          <Link
            key={module.id}
            href={module.href}
            className="card p-5 transition hover:-translate-y-0.5"
          >
            <p className="text-xs font-bold text-[var(--saffron)]">
              Module {index + 1} · {module.count} features
            </p>
            <h2 className="mt-2 text-lg font-bold">{module.title}</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{module.subtitle}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
