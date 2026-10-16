import Link from "next/link";
import { RoadDivider } from "@/components/brand";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <p className="label text-accent">404 · off the path</p>
      <h1 className="mt-2 text-3xl font-bold">We couldn’t find that page</h1>
      <p className="mt-2 text-muted">The paper or researcher may not exist in our sources, or the link is incomplete.</p>
      <RoadDivider className="my-8" />
      <Link href="/search" className="btn-primary">
        Search papers
      </Link>
    </div>
  );
}
