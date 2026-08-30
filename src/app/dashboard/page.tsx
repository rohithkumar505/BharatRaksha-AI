import {
  Ambulance,
  Boxes,
  Hospital,
  Users,
  Waves,
} from "lucide-react";

const stats = [
  { label: "Active Incidents", value: "128", tone: "#c0392b" },
  { label: "Rescue Teams Live", value: "36", tone: "#0b1f3a" },
  { label: "Shelter Occupancy", value: "68%", tone: "#e67e22" },
  { label: "Resource Gaps", value: "12", tone: "#0f766e" },
];

const allocations = [
  { item: "Drinking water kits", zone: "Zone A", status: "Dispatched" },
  { item: "Medical supplies", zone: "Zone C", status: "In transit" },
  { item: "Rescue boats", zone: "River belt", status: "Assigned" },
  { item: "Food packets", zone: "Zone B", status: "Stocked" },
];

export default function DashboardPage() {
  return (
    <div className="shell space-y-6">
      <section className="card p-6 md:p-8">
        <p className="pill bg-[#eef4f8] text-[var(--bg-deep)]">
          <Waves size={14} />
          Government & Rescue Dashboard
        </p>
        <h1
          className="mt-3 text-3xl font-bold"
          style={{ fontFamily: "var(--font-display), sans-serif" }}
        >
          Live Command Center
        </h1>
        <p className="mt-2 max-w-3xl text-[var(--muted)]">
          Monitor incidents, track rescue teams, allocate food/water/medicine,
          and manage shelters and volunteers from one place.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-5">
            <p className="text-sm text-[var(--muted)]">{stat.label}</p>
            <p className="mt-2 text-3xl font-bold" style={{ color: stat.tone }}>
              {stat.value}
            </p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="text-xl font-bold">Resource Allocation</h2>
          <div className="mt-4 space-y-3">
            {allocations.map((row) => (
              <div
                key={row.item}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[#f8fafc] px-4 py-3"
              >
                <div>
                  <p className="font-semibold">{row.item}</p>
                  <p className="text-sm text-[var(--muted)]">{row.zone}</p>
                </div>
                <span className="pill bg-white text-[var(--teal)]">{row.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-xl font-bold">Operations Snapshot</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              { icon: Users, title: "Volunteer Management" },
              { icon: Hospital, title: "Shelter Occupancy" },
              { icon: Boxes, title: "Food & Water Tracking" },
              { icon: Ambulance, title: "Medical Supply Tracking" },
            ].map(({ icon: Icon, title }) => (
              <div
                key={title}
                className="rounded-2xl border border-[var(--line)] bg-[#f8fafc] p-4"
              >
                <Icon className="text-[var(--bg-deep)]" size={18} />
                <p className="mt-3 font-semibold">{title}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
