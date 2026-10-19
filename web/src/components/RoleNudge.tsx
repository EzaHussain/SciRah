"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";

/** Signed-in accounts that haven't said whether they are a researcher or a reader. */
export function RoleNudge() {
  const { user } = useAuth();
  const pathname = usePathname();
  if (!user || user.role || pathname.startsWith("/welcome")) return null;
  return (
    <div className="border-b border-line bg-primary/12 px-4 py-2 text-center text-sm">
      Are you a researcher or a reader?{" "}
      <Link href={`/welcome?next=${encodeURIComponent(pathname)}`} className="link font-medium">
        Tell us in one click
      </Link>
    </div>
  );
}
