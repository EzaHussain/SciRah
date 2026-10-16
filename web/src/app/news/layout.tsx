import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Research news",
  description: "Recent news on the topics you research — from Pakistan and around the world.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
