"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Shield } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      mfaToken: mfaRequired ? mfaToken : undefined,
      redirect: false,
    });

    if (result?.error) {
      if (!mfaRequired && result.error.includes("MFA")) {
        setMfaRequired(true);
        setLoading(false);
        return;
      }
      setError(
        mfaRequired
          ? "Invalid MFA code"
          : result.error === "CredentialsSignin"
            ? "Invalid email or password"
            : `Login failed: ${result.error}`
      );
      setLoading(false);
      return;
    }

    if (result?.ok) {
      router.replace("/sih26190");
      return;
    }

    setError("Login failed. Please refresh the page and try again.");
    setLoading(false);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(ellipse at center, #1a2235 0%, #0a0e1a 70%)",
        padding: "1rem",
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 420,
          padding: "2.5rem 2rem",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <Shield
            size={52}
            strokeWidth={1.5}
            style={{ color: "var(--saffron)", margin: "0 auto 1rem", display: "block" }}
          />
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}
          >
            <span style={{ color: "var(--saffron)" }}>SIH26190</span> · Bharat Raksha AI
          </h1>
          <p
            style={{
              color: "var(--text-secondary)",
              fontSize: "0.9rem",
              marginTop: "0.75rem",
              lineHeight: 1.4,
            }}
          >
            MHA Secure Digital Document Management · Smart Automation
          </p>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginTop: "0.35rem" }}>
            Legal &amp; investigation documents — one product, one problem statement
          </p>
          <div
            style={{
              marginTop: "1rem",
              padding: "0.65rem 0.75rem",
              borderRadius: 8,
              background: "rgba(255, 153, 51, 0.08)",
              border: "1px solid rgba(255, 153, 51, 0.25)",
              textAlign: "left",
              fontSize: "0.72rem",
              lineHeight: 1.45,
              color: "var(--text-secondary)",
            }}
          >
            <strong style={{ color: "var(--text-primary)", fontSize: "0.75rem" }}>Demo login</strong>
            <div style={{ marginTop: "0.35rem" }}>
              investigator@bharatraksha.gov.in
              <br />
              Password: <code style={{ color: "var(--saffron)" }}>Invest@Bharat2026!</code>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          {!mfaRequired && (
            <>
              <div>
                <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                  placeholder="officer@bharatraksha.gov.in"
                  style={{ marginTop: "0.35rem", padding: "0.65rem 0.85rem" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={{ marginTop: "0.35rem", padding: "0.65rem 0.85rem" }}
                />
              </div>
            </>
          )}
          {mfaRequired && (
            <div>
              <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                MFA Code (6 digits)
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={mfaToken}
                onChange={(e) => setMfaToken(e.target.value)}
                required
                autoFocus
                style={{ marginTop: "0.35rem", padding: "0.65rem 0.85rem" }}
              />
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
                Enter the code from your authenticator app for {email}
              </p>
            </div>
          )}
          {error && (
            <p style={{ color: "var(--danger)", fontSize: "0.875rem", textAlign: "center" }}>{error}</p>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{
              justifyContent: "center",
              padding: "0.8rem",
              marginTop: "0.25rem",
              fontSize: "0.95rem",
              fontWeight: 600,
              borderRadius: 10,
            }}
          >
            {loading ? "Signing in..." : mfaRequired ? "Verify MFA" : "Sign In"}
          </button>
          {mfaRequired && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setMfaRequired(false);
                setMfaToken("");
                setError("");
              }}
              style={{ justifyContent: "center" }}
            >
              Back
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
