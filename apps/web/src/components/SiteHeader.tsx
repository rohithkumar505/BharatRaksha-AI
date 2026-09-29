"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { LogOut, Settings } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { NightWatchToggle } from "@/components/NightWatchToggle";
import { Sih26190ExtensionStrip } from "@/components/Sih26190ExtensionStrip";
import { isSih26190ExtensionPath } from "@/lib/sih26190-product-scope";

const VoicePartnerDock = dynamic(
  () => import("@/components/VoicePartnerDock").then((m) => m.VoicePartnerDock),
  { ssr: false, loading: () => null }
);

/**
 * App shell: left sidebar + top bar wrapping page content.
 * Use this instead of the old flat SiteHeader on authenticated pages.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      <AppSidebar />
      <div className="app-shell-main">
        <header className="app-topbar">
          <div className="app-topbar-inner">
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              MHA · SIH26190 Secure Legal Document Management
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <NightWatchToggle />
              {session?.user && (
                <>
                  <Link
                    href="/settings"
                    title="Settings"
                    style={{
                      display: "flex",
                      padding: "0.4rem",
                      color: pathname === "/settings" ? "var(--accent)" : "var(--text-secondary)",
                    }}
                  >
                    <Settings size={16} />
                  </Link>
                  <div style={{ textAlign: "right", fontSize: "0.8rem" }}>
                    <div style={{ fontWeight: 600 }}>{session.user.name}</div>
                    <div style={{ color: "var(--text-secondary)" }}>
                      {session.user.role?.replace("_", " ")}
                    </div>
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    style={{ padding: "0.4rem" }}
                    type="button"
                  >
                    <LogOut size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
        </header>
        {isSih26190ExtensionPath(pathname) && <Sih26190ExtensionStrip />}
        <div className="app-shell-content">{children}</div>
        <VoicePartnerDock />
      </div>
    </div>
  );
}

/**
 * Backward-compatible alias: old pages used <SiteHeader /> as a sibling.
 * Prefer <AppShell>{children}</AppShell>.
 * When SiteHeader is rendered alone it mounts the shell chrome only (sidebar+topbar)
 * via a portal-less fixed layout; pair with class app-page on main — see migrate to AppShell.
 */
export function SiteHeader() {
  return <AppShellChrome />;
}

function AppShellChrome() {
  const pathname = usePathname();
  const { data: session } = useSession();
  if (pathname === "/login") return null;

  return (
    <>
      <AppSidebar />
      <header className="app-topbar app-topbar-standalone">
        <div className="app-topbar-inner">
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            Bharat Raksha AI · SIH26190
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {session?.user && (
              <>
                <Link
                  href="/settings"
                  title="Settings"
                  style={{
                    display: "flex",
                    padding: "0.4rem",
                    color: pathname === "/settings" ? "var(--accent)" : "var(--text-secondary)",
                  }}
                >
                  <Settings size={16} />
                </Link>
                <div style={{ textAlign: "right", fontSize: "0.8rem" }}>
                  <div style={{ fontWeight: 600 }}>{session.user.name}</div>
                  <div style={{ color: "var(--text-secondary)" }}>
                    {session.user.role?.replace("_", " ")}
                  </div>
                </div>
                <button
                  className="btn btn-secondary"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  style={{ padding: "0.4rem" }}
                  type="button"
                >
                  <LogOut size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
