"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError, authorHref } from "@/lib/api";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: "reader" | "researcher" | null;
  affiliation: string | null;
  google: boolean;
  password: boolean;
  created_at: string;
  last_login_at: string | null;
  author_id: string | null;
  method: string | null;
  saved: number;
}

interface UsersResponse {
  totals: { users: number; researchers: number; readers: number; no_role: number; verified: number; last7: number; active7: number };
  page: number;
  pageSize: number;
  matching: number;
  users: UserRow[];
}

const FILTERS = [
  ["", "Everyone"],
  ["researcher", "Researchers"],
  ["reader", "Readers"],
  ["verified", "Verified profiles"],
  ["none", "No role yet"],
] as const;

const date = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

/** Admins: everyone who has a SciRah account, with simple totals. */
export default function AdminUsersPage() {
  const { user, loading, getToken } = useAuth();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UsersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ page: String(page), ...(search ? { q: search } : {}), ...(role ? { role } : {}) });
      setData(await api<UsersResponse>(`/admin/users?${qs}`, { token: await getToken() }));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load users");
    }
  }, [getToken, page, search, role]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the list for the current filters
    if (user?.isAdmin) load();
  }, [user, load]);

  if (loading) return null;
  if (!user?.isAdmin)
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Admins only</h1>
      </div>
    );

  const t = data?.totals;
  const pages = data ? Math.max(1, Math.ceil(data.matching / data.pageSize)) : 1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="label mb-2 text-accent">Admin</p>
      <h1 className="text-3xl font-bold">All users</h1>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {(
          [
            ["Accounts", t?.users],
            ["Researchers", t?.researchers],
            ["Readers", t?.readers],
            ["No role yet", t?.no_role],
            ["Verified profiles", t?.verified],
            ["New this week", t?.last7],
            ["Signed in this week", t?.active7],
          ] as const
        ).map(([label, v]) => (
          <div key={label} className="card p-3">
            <dt className="label text-[10px] text-muted">{label}</dt>
            <dd className="mt-1 font-heading text-2xl font-semibold">{v ?? "…"}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(q.trim());
          }}
          className="flex gap-2"
        >
          <input className="input py-1.5" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" aria-label="Search users" />
          <button className="btn-ghost py-1.5">Search</button>
        </form>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(([v, label]) => (
            <button
              key={v}
              onClick={() => (setRole(v), setPage(1))}
              className={`rounded-lg border px-2.5 py-1 text-sm ${role === v ? "border-primary bg-primary/12" : "border-line text-muted hover:text-fg"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-accent">{error}</p>}

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-3 py-2 font-medium">Name &amp; email</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Signs in with</th>
              <th className="px-3 py-2 font-medium">Verified profile</th>
              <th className="px-3 py-2 text-right font-medium">Saved</th>
              <th className="px-3 py-2 font-medium">Joined</th>
              <th className="px-3 py-2 font-medium">Last sign-in</th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted">
                  Loading…
                </td>
              </tr>
            ) : data.users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted">
                  No users match.
                </td>
              </tr>
            ) : (
              data.users.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2">
                    <span className="block font-medium">{u.name || "—"}</span>
                    <span className="block text-xs text-muted">{u.email}</span>
                    {u.affiliation && <span className="block text-xs text-muted">{u.affiliation}</span>}
                  </td>
                  <td className="px-3 py-2">{u.role === "researcher" ? "Researcher" : u.role === "reader" ? "Reader" : <span className="text-muted">—</span>}</td>
                  <td className="px-3 py-2 text-xs">{[u.google && "Google", u.password && "Password"].filter(Boolean).join(" + ") || "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {u.author_id ? (
                      <Link href={authorHref(u.author_id)} className="link">
                        ✓ {u.method === "email" ? "University email" : u.method === "orcid" ? "ORCID" : "Admin approved"}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{u.saved}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{date(u.created_at)}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{date(u.last_login_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button className="btn-ghost py-1" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Previous
          </button>
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          <button className="btn-ghost py-1" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
