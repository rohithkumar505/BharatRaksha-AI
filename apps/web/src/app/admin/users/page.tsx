"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/SiteHeader";
import { usePermissions } from "@/hooks/usePermissions";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  policeStation: string | null;
  badgeNumber: string | null;
  isActive: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
}

export default function AdminUsersPage() {
  const { can } = usePermissions();
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    role: "INVESTIGATOR",
    policeStation: "",
    badgeNumber: "",
  });

  function loadUsers() {
    fetch("/api/users")
      .then((r) => r.json())
      .then(setUsers);
  }

  useEffect(() => {
    if (can("users:manage")) loadUsers();
  }, [can]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowForm(false);
      setForm({ email: "", password: "", name: "", role: "INVESTIGATOR", policeStation: "", badgeNumber: "" });
      loadUsers();
    } else {
      const err = await res.json();
      alert(err.error?.join?.("\n") ?? JSON.stringify(err.error));
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    if (isActive) {
      await fetch(`/api/users/${id}`, { method: "DELETE" });
    } else {
      await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
    }
    loadUsers();
  }

  if (!can("users:manage")) {
    return (
      <AppShell>
                <main style={{ padding: "2rem", textAlign: "center" }}>
          <p>Access denied. Admin role required.</p>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
            <main style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2rem" }}>
          <div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>User Management</h1>
            <p style={{ color: "var(--text-secondary)" }}>Manage investigators, officers, and auditors</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            Add User
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="card" style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontWeight: 600, marginBottom: "1rem" }}>Create User</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <input placeholder="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              <input type="password" placeholder="Password (min 12 chars)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="INVESTIGATOR">Investigator</option>
                <option value="SENIOR_OFFICER">Senior Officer</option>
                <option value="ADMIN">Admin</option>
                <option value="AUDITOR">Auditor</option>
              </select>
              <input placeholder="Police Station" value={form.policeStation} onChange={(e) => setForm({ ...form, policeStation: e.target.value })} />
              <input placeholder="Badge Number" value={form.badgeNumber} onChange={(e) => setForm({ ...form, badgeNumber: e.target.value })} />
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
              Password must be 12+ chars with uppercase, lowercase, number, and special character.
            </p>
            <button type="submit" className="btn btn-primary" style={{ marginTop: "1rem" }}>Create</button>
          </form>
        )}

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Station</th>
                <th>MFA</th>
                <th>Last Login</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td><span className="badge badge-new">{u.role.replace("_", " ")}</span></td>
                  <td>{u.policeStation ?? "—"}</td>
                  <td>{u.mfaEnabled ? "✓" : "—"}</td>
                  <td style={{ fontSize: "0.8rem" }}>
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("en-IN") : "Never"}
                  </td>
                  <td>
                    <span className={`badge ${u.isActive ? "badge-low" : "badge-high"}`}>
                      {u.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                      onClick={() => toggleActive(u.id, u.isActive)}
                    >
                      {u.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </AppShell>
  );
}
