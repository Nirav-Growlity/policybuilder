"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { href: "/admin/organizations", label: "Normal organizations", exact: true },
  { href: "/admin/organizations/policycraft", label: "PolicyCraft organizations", exact: false },
];

export function OrganizationSectionNavigation() {
  const pathname = usePathname();

  return <nav aria-label="Organization areas" className="mb-6 border-b border-[var(--color-line)]">
    <ul className="-mb-px flex flex-wrap gap-2">
      {sections.map((section) => {
        const current = section.exact ? pathname === section.href : pathname === section.href || pathname.startsWith(`${section.href}/`) || /^\/admin\/organizations\/(?:new|\d+)(?:\/|$)/.test(pathname);
        return <li key={section.href}>
          <Link href={section.href} aria-current={current ? "page" : undefined} className={`inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-forest)] ${current ? "border-[var(--color-forest)] text-[var(--color-forest-deep)]" : "border-transparent text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"}`}>
            {section.label}
          </Link>
        </li>;
      })}
    </ul>
  </nav>;
}
