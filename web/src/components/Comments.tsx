"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import type { Comment } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { Avatar } from "./Header";
import { SpinnerIcon } from "./icons";

export function Comments({ paperId }: { paperId: string }) {
  const { user, getToken, configured } = useAuth();
  const pathname = usePathname();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Comment[]>(`/comments?paperId=${encodeURIComponent(paperId)}`)
      .then(setComments)
      .catch(() => setUnavailable(true));
  }, [paperId]);

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setPosting(true);
    setError(null);
    try {
      const c = await api<Comment>("/comments", { method: "POST", token: await getToken(), body: { paperId, body: text } });
      setComments((prev) => [...(prev ?? []), c]);
      setBody("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not post your comment.");
    } finally {
      setPosting(false);
    }
  };

  const remove = async (id: string) => {
    const prev = comments;
    setComments((cs) => cs?.filter((c) => c.id !== id) ?? null);
    try {
      await api(`/comments/${id}`, { method: "DELETE", token: await getToken() });
    } catch {
      setComments(prev);
    }
  };

  return (
    <section aria-labelledby="discussion">
      <h2 id="discussion" className="mb-4 text-lg font-semibold">
        Discussion {comments && comments.length > 0 && <span className="font-mono text-sm text-muted">({comments.length})</span>}
      </h2>

      {unavailable ? (
        <p className="text-sm text-muted">Comments are unavailable right now.</p>
      ) : comments === null ? (
        <div className="skeleton h-16 w-full" />
      ) : (
        <>
          {comments.length === 0 && <p className="mb-4 text-sm text-muted">No comments yet. Start the discussion — ask a question or share how you used this paper.</p>}
          <ul className="mb-5 space-y-4">
            {comments.map((c) => (
              <li key={c.id} className="flex gap-3">
                <Avatar name={c.author.name} url={c.author.avatarUrl} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{c.author.name}</span>{" "}
                    <time dateTime={c.createdAt} className="text-xs text-muted">
                      {timeAgo(c.createdAt)}
                    </time>
                    {user?.id === c.userId && (
                      <button onClick={() => remove(c.id)} className="ml-2 text-xs text-muted hover:text-accent">
                        Delete
                      </button>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed break-words whitespace-pre-line" dir="auto">
                    {c.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {user ? (
            <form onSubmit={post} className="card p-3">
              <label htmlFor="comment" className="sr-only">
                Add a comment
              </label>
              <textarea
                id="comment"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={2000}
                rows={3}
                dir="auto"
                placeholder="Share a thought or question (English or Urdu)…"
                className="w-full resize-y bg-transparent p-1 text-sm placeholder:text-muted/70 focus:outline-none"
              />
              <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
                <span className="font-mono text-[11px] text-muted">{body.length}/2000</span>
                <button className="btn-primary py-1.5" disabled={posting || !body.trim()}>
                  {posting && <SpinnerIcon />} Post
                </button>
              </div>
              {error && (
                <p role="alert" className="mt-2 text-sm text-accent">
                  {error}
                </p>
              )}
            </form>
          ) : configured ? (
            <p className="text-sm text-muted">
              <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="link text-fg">
                Sign in
              </Link>{" "}
              to join the discussion.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
