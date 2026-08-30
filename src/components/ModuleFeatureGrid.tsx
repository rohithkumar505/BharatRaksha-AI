import Link from "next/link";
import { featuresByModule, type FeatureModuleId, modules } from "@/lib/features";

export function ModuleFeatureGrid({ moduleId }: { moduleId: FeatureModuleId }) {
  const module = modules.find((m) => m.id === moduleId);
  const list = featuresByModule(moduleId);

  return (
    <section className="card p-6 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[var(--saffron)]">
            {list.length} features in this module
          </p>
          <h2
            className="mt-1 text-2xl font-bold"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            {module?.title}
          </h2>
          <p className="mt-2 text-[var(--muted)]">{module?.subtitle}</p>
        </div>
        <Link href="/features" className="btn btn-soft text-sm">
          View all 82 features
        </Link>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {list.map((feature) => (
          <article
            key={feature.id}
            className="rounded-2xl border border-[var(--line)] bg-[#f8fafc] p-4"
          >
            <p className="text-xs font-bold text-[var(--teal)]">Feature #{feature.id}</p>
            <h3 className="mt-1 font-bold">{feature.name}</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">{feature.description}</p>
            <p className="mt-2 text-sm">
              <span className="font-semibold">How it works: </span>
              {feature.howItWorks}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
