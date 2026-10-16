"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { api, API_URL, ApiError } from "@/lib/api";
import { useAuth } from "./AuthProvider";
import { SparkIcon, SpinnerIcon } from "./icons";

/**
 * An AI illustration of the paper's topic (from its title + abstract). Generated once per paper on
 * request, then shown to everyone. Always labelled as AI-generated.
 */
export function AiGraphic({ paperId, title }: { paperId: string; title: string }) {
  const { user, getToken } = useAuth();
  const pathname = usePathname();
  const src = `${API_URL}/ai/graphic?paperId=${encodeURIComponent(paperId)}`;
  const [state, setState] = useState<"loading" | "shown" | "missing" | "busy">("loading");
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setError(null);
    setState("busy");
    try {
      await api("/ai/graphic", { method: "POST", token: await getToken(), body: { paperId } });
      setVersion((v) => v + 1);
      setState("loading");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the graphic.");
      setState("missing");
    }
  };

  return (
    <section aria-label="Visual summary" className="card overflow-hidden">
      {(state === "loading" || state === "shown") && (
        <figure className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- served by the SciRah API */}
          <img
            key={version}
            src={version ? `${src}&v=${version}` : src}
            alt={`AI illustration of the topic of “${title}”`}
            className={`aspect-[3/2] w-full object-cover ${state === "loading" ? "invisible h-0" : ""}`}
            onLoad={() => setState("shown")}
            onError={() => setState("missing")}
          />
          {state === "shown" && (
            <figcaption className="flex items-center gap-2 border-t border-line px-4 py-2 text-xs text-muted">
              <SparkIcon className="h-3.5 w-3.5 text-primary" />
              AI-generated illustration of the topic — not a figure from the paper, and may not be scientifically accurate.
            </figcaption>
          )}
        </figure>
      )}
      {(state === "missing" || state === "busy") && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h2 className="font-semibold">
              Visual summary
            </h2>
            <p className="text-sm text-muted">Create an AI illustration of this paper’s topic from its title and abstract.</p>
            {error && <p className="mt-1 text-sm text-accent">{error}</p>}
          </div>
          {user ? (
            <button className="btn-ghost" onClick={create} disabled={state === "busy"}>
              {state === "busy" ? (
                <>
                  <SpinnerIcon /> Drawing… (up to a minute)
                </>
              ) : (
                <>
                  <SparkIcon /> Create graphic
                </>
              )}
            </button>
          ) : (
            <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="btn-ghost">
              Sign in to create
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
