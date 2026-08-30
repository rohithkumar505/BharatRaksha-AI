import Link from "next/link";
import { ModuleFeatureGrid } from "@/components/ModuleFeatureGrid";
import { riskDemo } from "@/lib/demo-data";

export default function PredictionPage() {
  return (
    <div className="shell space-y-6">
      <section className="card p-6 md:p-8">
        <h1
          className="text-3xl font-bold"
          style={{ fontFamily: "var(--font-display), sans-serif" }}
        >
          AI Disaster Prediction
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Multi-hazard intelligence for flood, cyclone, landslide, earthquake risk,
          heatwave and drought — plus live weather and a combined risk score.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl bg-[var(--bg-deep)] p-5 text-white md:col-span-2 xl:col-span-1">
            <p className="text-sm text-white/70">Overall Risk Score</p>
            <p className="mt-2 text-5xl font-bold">{riskDemo.overallScore}</p>
            <p className="mt-2 text-[var(--saffron)] font-semibold">
              {riskDemo.level} · {riskDemo.location}
            </p>
          </div>
          {riskDemo.hazards.map((hazard) => (
            <div
              key={hazard.name}
              className="rounded-2xl border border-[var(--line)] bg-[#f8fafc] p-4"
            >
              <p className="font-bold">{hazard.name}</p>
              <p className="mt-2 text-3xl font-bold text-[var(--bg-deep)]">
                {hazard.score}
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">{hazard.level}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-2xl border border-[var(--line)] bg-[#f8fafc] p-4">
          <p className="font-bold">Real-time Weather Monitoring</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {riskDemo.weather.condition} · {riskDemo.weather.tempC}°C · Rain{" "}
            {riskDemo.weather.rainfallMm} mm · Humidity {riskDemo.weather.humidity}% ·
            Wind {riskDemo.weather.windKph} km/h
          </p>
        </div>
        <Link href="/assistant?q=flood%20risk" className="btn btn-accent mt-6">
          Ask Assistant about risk
        </Link>
      </section>
      <ModuleFeatureGrid moduleId="prediction" />
    </div>
  );
}
