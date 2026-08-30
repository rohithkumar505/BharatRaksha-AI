import Link from "next/link";
import { Hospital, MapPinned, Route, Tent } from "lucide-react";

const layers = [
  { label: "Flood zones", color: "#c0392b" },
  { label: "Safe zones", color: "#1e844a" },
  { label: "Blocked roads", color: "#e67e22" },
  { label: "Shelters", color: "#0f766e" },
  { label: "Hospitals", color: "#1f4e79" },
];

const places = [
  { title: "District School Relief Camp", meta: "Shelter · 1.2 km · Capacity 62%" },
  { title: "Civil Hospital Zone A", meta: "Hospital · 2.1 km · Emergency open" },
  { title: "Community Hall Zone B", meta: "Shelter · 2.4 km · Capacity 41%" },
  { title: "Safe Route via NH Bypass", meta: "Evacuation · Avoid riverside road" },
];

export default function MapPage() {
  return (
    <div className="shell space-y-6">
      <section className="card p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="pill bg-[#e8f6f3] text-[var(--teal)]">
              <MapPinned size={14} />
              Live Disaster Map
            </p>
            <h1
              className="mt-3 text-3xl font-bold"
              style={{ fontFamily: "var(--font-display), sans-serif" }}
            >
              Smart Maps & Navigation
            </h1>
            <p className="mt-2 max-w-2xl text-[var(--muted)]">
              Demo map layer for flood zones, safe routes, shelters, and hospitals.
              Mapbox live tiles will connect next with your API token.
            </p>
          </div>
          <Link href="/assistant?q=safe%20route" className="btn btn-primary">
            Ask Assistant for Route
          </Link>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="card relative min-h-[420px] overflow-hidden p-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(192,57,43,0.25),transparent_28%),radial-gradient(circle_at_70%_40%,rgba(30,132,74,0.28),transparent_30%),linear-gradient(160deg,#d9e7f2,#f7fafc)]" />
          <div className="absolute left-[18%] top-[28%] h-24 w-24 rounded-full bg-[rgba(192,57,43,0.28)] blur-sm" />
          <div className="absolute left-[58%] top-[36%] h-28 w-28 rounded-full bg-[rgba(30,132,74,0.3)] blur-sm" />
          <div className="absolute bottom-4 left-4 right-4 rounded-2xl bg-white/90 p-4 backdrop-blur">
            <p className="font-bold">Assam demo canvas</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Red = flood risk · Green = safe zone · Connect Mapbox for production tiles.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="font-bold">Map Layers</h2>
            <div className="mt-4 space-y-3">
              {layers.map((layer) => (
                <div key={layer.label} className="flex items-center gap-3 text-sm">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ background: layer.color }}
                  />
                  {layer.label}
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-bold">Nearby / Routes</h2>
            <div className="mt-4 space-y-3">
              {places.map((place) => (
                <div
                  key={place.title}
                  className="rounded-2xl border border-[var(--line)] bg-[#f8fafc] px-3 py-3"
                >
                  <p className="font-semibold">{place.title}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{place.meta}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { icon: Route, title: "Safe Route Navigation" },
          { icon: Tent, title: "Nearby Shelter Finder" },
          { icon: Hospital, title: "Nearby Hospital Finder" },
        ].map(({ icon: Icon, title }) => (
          <div key={title} className="card flex items-center gap-3 p-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--bg-deep)] text-white">
              <Icon size={18} />
            </span>
            <p className="font-semibold">{title}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
