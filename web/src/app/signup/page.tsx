import { redirect } from "next/navigation";

/** Sign-up and sign-in are one page now; keep old /signup links working. */
export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? `?next=${encodeURIComponent(sp.next)}` : "";
  redirect(`/login${next}`);
}
