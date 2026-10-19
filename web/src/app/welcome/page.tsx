"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { safeNext } from "@/components/AuthForm";
import { HeaderLogo } from "@/components/brand";
import { SpinnerIcon } from "@/components/icons";
import { RolePicker, type Role } from "@/components/RolePicker";
import { api, ApiError } from "@/lib/api";

/** First sign-in (e.g. with Google): researcher or reader? */
export default function WelcomePage() {
  return (
    <Suspense>
      <Welcome />
    </Suspense>
  );
}

function Welcome() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, getToken, refresh } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!role) return;
    setBusy(true);
    setError(null);
    try {
      await api("/auth/me", { method: "PATCH", token: await getToken(), body: { role } });
      await refresh();
      router.replace(role === "researcher" ? "/account?setup=1" : safeNext(params.get("next")));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:py-16">
      <div className="mb-6 text-center">
        <HeaderLogo className="mx-auto mb-4 h-16 w-16 rounded-2xl shadow-lg" />
        <h1 className="text-2xl font-bold">Welcome{user ? `, ${user.name.split(" ")[0]}` : ""}!</h1>
        <p className="mt-1.5 text-sm text-muted">One quick question so SciRah fits how you use research. You can change it later in Account settings.</p>
      </div>
      <div className="card p-5">
        <RolePicker value={role} onChange={setRole} />
        {error && <p className="mt-3 text-sm text-accent">{error}</p>}
        <button className="btn-primary mt-4 w-full py-2.5" disabled={!role || busy} onClick={save}>
          {busy && <SpinnerIcon />} Continue
        </button>
      </div>
    </div>
  );
}
