export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

interface ApiOptions extends Omit<RequestInit, "body"> {
  token?: string | null;
  body?: unknown;
}

/** Fetch JSON from the SciRah API. Works in Server and Client Components. */
export async function api<T>(path: string, { token, body, headers, ...init }: ApiOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      cache: "no-store",
      ...init,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the SciRah server. Please check your connection and try again.", 0);
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      message = Array.isArray(data.message) ? data.message.join(", ") : (data.message ?? message);
    } catch {}
    throw new ApiError(message, res.status);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/**
 * For server pages: let Vercel keep the API response (and the page built from it) for `seconds`
 * instead of fetching and rendering on every visit.
 */
export const cached = (seconds: number) => ({ cache: "force-cache" as const, next: { revalidate: seconds } });

export const paperHref = (id: string) => `/paper/${encodeURIComponent(id)}`;
export const authorHref = (id: string) => `/author/${encodeURIComponent(id)}`;
export const venueHref = (id: string) => `/venue/${encodeURIComponent(id)}`;

/**
 * Every outside link opens inside SciRah: publisher pages, PDFs, news articles and profiles go
 * through the in-app reader (/read) instead of a new tab or another website.
 */
export function readerHref(url: string, opts: { title?: string; paperId?: string; back?: string } = {}) {
  const p = new URLSearchParams({ url });
  if (opts.title) p.set("title", opts.title.slice(0, 200));
  if (opts.paperId) p.set("paper", opts.paperId);
  if (opts.back) p.set("back", opts.back);
  return `/read?${p.toString()}`;
}

/** The PDF proxy URL used by the reader to show open-access PDFs inside SciRah. */
export const pdfProxyUrl = (url: string) => `${API_URL}/reader/pdf?url=${encodeURIComponent(url)}`;

/** Route params may arrive encoded or decoded depending on the host; normalise once. */
export function decodeParam(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
