"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/SiteHeader";
import { useSession } from "next-auth/react";
import Image from "next/image";

export default function SettingsPage() {
  const { data: session } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
  const [mfaQr, setMfaQr] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState("");
  const [mfaMsg, setMfaMsg] = useState("");

  useEffect(() => {
    if (session?.user?.mfaEnabled) {
      setMfaMsg("MFA is enabled on your account.");
    }
  }, [session]);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg("");
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    });
    const data = await res.json();
    if (res.ok) {
      setPasswordMsg("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      setPasswordMsg(data.error?.join?.("\n") ?? data.error ?? "Failed to update password");
    }
  }

  async function setupMfa() {
    const res = await fetch("/api/auth/mfa/setup", { method: "POST" });
    const data = await res.json();
    if (res.ok) setMfaQr(data.qrDataUrl);
    else setMfaMsg(data.error ?? "MFA setup failed");
  }

  async function verifyMfa(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: mfaToken }),
    });
    const data = await res.json();
    if (res.ok) {
      setMfaMsg("MFA enabled successfully. Sign out and sign in again.");
      setMfaQr(null);
    } else {
      setMfaMsg(data.error ?? "Invalid MFA code");
    }
  }

  return (
    <AppShell>
            <main style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "2rem" }}>
          Account Settings
        </h1>

        <section className="card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontWeight: 600, marginBottom: "1rem" }}>Change Password</h2>
          <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="New password (12+ chars)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary">Update Password</button>
          </form>
          {passwordMsg && (
            <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
              {passwordMsg}
            </p>
          )}
        </section>

        <section className="card">
          <h2 style={{ fontWeight: 600, marginBottom: "1rem" }}>Multi-Factor Authentication</h2>
          {session?.user?.mfaEnabled ? (
            <p style={{ color: "var(--success)" }}>MFA is active on your account.</p>
          ) : (
            <>
              {!mfaQr ? (
                <button className="btn btn-secondary" onClick={setupMfa}>
                  Set up MFA (TOTP)
                </button>
              ) : (
                <form onSubmit={verifyMfa}>
                  <p style={{ marginBottom: "1rem", fontSize: "0.875rem" }}>
                    Scan this QR code with Google Authenticator or similar app:
                  </p>
                  <Image
                    src={mfaQr}
                    alt="MFA QR Code"
                    width={200}
                    height={200}
                    style={{ marginBottom: "1rem" }}
                  />
                  <input
                    placeholder="6-digit code"
                    value={mfaToken}
                    onChange={(e) => setMfaToken(e.target.value)}
                    required
                    style={{ marginBottom: "0.75rem" }}
                  />
                  <button type="submit" className="btn btn-primary">Verify & Enable MFA</button>
                </form>
              )}
            </>
          )}
          {mfaMsg && (
            <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
              {mfaMsg}
            </p>
          )}
        </section>
      </main>
    </AppShell>
  );
}
