"use client";

import Link from "next/link";
import { FileCheck, Gauge, Shield, Zap } from "lucide-react";
import { SIH26190_CORE_PATHS, SIH26190_PRODUCT } from "@/lib/sih26190-product-scope";

export function Sih26190QuickStart() {
  const links = [
    { href: "/sih26190", label: "SIH26190 Portal", icon: Shield },
    { href: "/legal-docs", label: "Legal Document Center", icon: FileCheck },
    { href: "/legal-command", label: "MHA Command Center", icon: Gauge },
    { href: "/verify-document", label: "Public verify", icon: Zap },
  ] as const;

  return (
    <div
      className="card"
      style={{
        padding: "1.25rem",
        marginBottom: "1.5rem",
        border: "1px solid var(--saffron)",
        background: "linear-gradient(135deg, rgba(255,153,51,0.08), transparent)",
      }}
    >
      <h2 style={{ fontSize: "1.15rem", fontWeight: 800, marginBottom: "0.35rem" }}>{SIH26190_PRODUCT.shortName}</h2>
      <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", maxWidth: 720, marginBottom: "1rem" }}>
        {SIH26190_PRODUCT.title} · {SIH26190_PRODUCT.ministry} · {SIH26190_PRODUCT.theme}. Start demo here — Smart
        Automation+ tools in the sidebar are extras on the same platform.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {links.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="btn btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon size={14} /> {label}
          </Link>
        ))}
      </div>
      <p style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.75rem" }}>
        Core routes: {SIH26190_CORE_PATHS.join(" · ")}
      </p>
    </div>
  );
}
