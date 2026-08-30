import Link from "next/link";
import { Shield } from "lucide-react";
import { modules } from "@/lib/features";

const topLinks = [
  { href: "/", label: "Home" },
  { href: "/assistant", label: "AI Assistant" },
  { href: "/features", label: "All Features" },
  { href: "/prediction", label: "Prediction" },
  { href: "/map", label: "Map" },
  { href: "/dashboard", label: "Dashboard" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-white/90 backdrop-blur-md">
      <div className="shell flex items-center justify-between gap-4 py-3">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--bg-deep)] text-white">
            <Shield size={20} />
          </span>
          <span>
            <span
              className="block text-lg font-bold tracking-tight"
              style={{ fontFamily: "var(--font-display), sans-serif" }}
            >
              BharatRaksha AI
            </span>
            <span className="block text-xs text-[var(--muted)]">
              The AI Shield for Every Disaster
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {topLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--muted)] transition hover:bg-[#eef4f8] hover:text-[var(--ink)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <Link href="/assistant" className="btn btn-accent text-sm">
          Open Assistant
        </Link>
      </div>
      <div className="shell flex gap-2 overflow-x-auto pb-3">
        {modules.map((module) => (
          <Link
            key={module.id}
            href={module.href}
            className="whitespace-nowrap rounded-full border border-[var(--line)] bg-[#f8fafc] px-3 py-1.5 text-xs font-semibold text-[var(--ink)]"
          >
            {module.title}
          </Link>
        ))}
      </div>
    </header>
  );
}
