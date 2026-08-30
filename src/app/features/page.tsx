import { features, modules, TOTAL_FEATURES } from "@/lib/features";
import Link from "next/link";

export default function FeaturesPage() {
  return (
    <div className="shell space-y-6">
      <section className="card p-6 md:p-8">
        <h1
          className="text-3xl font-bold"
          style={{ fontFamily: "var(--font-display), sans-serif" }}
        >
          All {TOTAL_FEATURES} Features
        </h1>
        <p className="mt-2 max-w-3xl text-[var(--muted)]">
          Complete BharatRaksha AI feature set discussed for the project — every
          module, every capability, software-only.
        </p>
      </section>

      {modules.map((module) => {
        const list = features.filter((f) => f.module === module.id);
        return (
          <section key={module.id} className="card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{module.title}</h2>
                <p className="text-sm text-[var(--muted)]">
                  {list.length} features · {module.subtitle}
                </p>
              </div>
              <Link href={module.href} className="btn btn-soft text-sm">
                Open module
              </Link>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {list.map((feature) => (
                <div
                  key={feature.id}
                  className="rounded-2xl border border-[var(--line)] bg-[#f8fafc] p-4"
                >
                  <p className="text-xs font-bold text-[var(--teal)]">
                    #{feature.id}
                  </p>
                  <h3 className="mt-1 font-bold">{feature.name}</h3>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    {feature.description}
                  </p>
                  <p className="mt-2 text-sm">
                    <span className="font-semibold">How it works: </span>
                    {feature.howItWorks}
                  </p>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
