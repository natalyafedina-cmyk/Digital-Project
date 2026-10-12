import Link from "next/link";
import type { ReactNode } from "react";

// Unfinished navigation keeps its layout but cannot send learners to a 404.
export default function HomeLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  if (href.startsWith("/section/")) {
    return <span aria-disabled="true" className={className}>{children}</span>;
  }
  return <Link href={href} className={className}>{children}</Link>;
}
