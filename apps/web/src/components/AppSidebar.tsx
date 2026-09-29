"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Shield, Menu, X, ChevronDown } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { NAV_GROUPS } from "@/lib/nav-config";

export function AppSidebar() {
  const pathname = usePathname();
  const { can } = usePermissions();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (pathname === "/login") return null;

  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => can(item.permission)),
  })).filter((g) => g.items.length > 0);

  const nav = (
    <nav style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "0.75rem" }}>
      {groups.map((group) => {
        const isCollapsed = collapsed[group.id];
        return (
          <div key={group.id}>
            <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [group.id]: !c[group.id] }))}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "transparent",
                border: "none",
                color: "var(--text-secondary)",
                fontSize: "0.7rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                padding: "0.25rem 0.5rem",
                cursor: "pointer",
              }}
            >
              {group.label}
              <ChevronDown
                size={14}
                style={{
                  transform: isCollapsed ? "rotate(-90deg)" : "none",
                  transition: "transform 0.15s",
                }}
              />
            </button>
            {!isCollapsed && (
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
                {group.items.map(({ href, label }) => {
                  const active = pathname === href || pathname.startsWith(href + "/");
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMobileOpen(false)}
                      style={{
                        display: "block",
                        padding: "0.45rem 0.65rem",
                        borderRadius: 8,
                        fontSize: "0.84rem",
                        fontWeight: active ? 600 : 400,
                        color: active ? "var(--accent)" : "var(--text-primary)",
                        background: active ? "rgba(59,130,246,0.12)" : "transparent",
                        borderLeft: active ? "3px solid var(--accent)" : "3px solid transparent",
                      }}
                    >
                      {label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      <button
        type="button"
        className="app-sidebar-mobile-toggle"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        style={{
          position: "fixed",
          top: 12,
          left: 12,
          zIndex: 60,
          display: "none",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 8,
          color: "var(--text-primary)",
          cursor: "pointer",
        }}
      >
        <Menu size={18} />
      </button>

      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 70,
          }}
        />
      )}

      <aside
        className={`app-sidebar${mobileOpen ? " app-sidebar-open" : ""}`}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: 260,
          background: "var(--bg-secondary)",
          borderRight: "1px solid var(--border)",
          zIndex: 80,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            padding: "1rem 1rem 0.75rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <Link href="/sih26190" style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 700 }}>
            <Shield size={20} style={{ color: "var(--saffron)" }} />
            <span style={{ lineHeight: 1.2 }}>
              <span style={{ color: "var(--saffron)" }}>SIH26190</span>
              <span style={{ display: "block", fontSize: "0.65rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                Bharat Raksha
              </span>
            </span>
          </Link>
          <button
            type="button"
            className="app-sidebar-close"
            onClick={() => setMobileOpen(false)}
            style={{
              display: "none",
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <X size={18} />
          </button>
        </div>
        {nav}
      </aside>
    </>
  );
}
