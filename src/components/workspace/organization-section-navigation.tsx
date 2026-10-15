"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SelectionPill } from "@/components/workspace/workspace-motion";
import type { PolicyCraftOrganization } from "@/lib/policycraft-access-types";
import styles from "./organization-section-navigation.module.css";

type OrganizationSource = PolicyCraftOrganization["source"];

const sections: { href: string; label: string; exact: boolean; source: OrganizationSource }[] = [
  { href: "/admin/organizations", label: "Normal organizations", exact: true, source: "esg" },
  { href: "/admin/organizations/policycraft", label: "PolicyCraft organizations", exact: false, source: "standalone" },
];

/**
 * Section switcher that sits on the masthead's ink band, inside the page hero.
 * With `value` and `onChange` it switches the source in place instead of navigating.
 */
export function OrganizationSectionNavigation({ value, onChange }: { value?: OrganizationSource; onChange?: (source: OrganizationSource) => void } = {}) {
  const pathname = usePathname();

  if (value && onChange) return <nav aria-label="Organization source" className={styles.navigation}>
    <ul className={styles.links}>
      {sections.map((section) => {
        const current = section.source === value;
        return <li key={section.source}>
          <button type="button" onClick={() => onChange(section.source)} aria-pressed={current} className={`${styles.link} ${current ? styles.current : ""}`}>
            {current ? <SelectionPill layoutId="organization-section" className={styles.pill} /> : null}
            {section.label}
          </button>
        </li>;
      })}
    </ul>
  </nav>;

  return <nav aria-label="Organization areas" className={styles.navigation}>
    <ul className={styles.links}>
      {sections.map((section) => {
        const current = section.exact ? pathname === section.href : pathname === section.href || pathname.startsWith(`${section.href}/`) || /^\/admin\/organizations\/(?:new|\d+)(?:\/|$)/.test(pathname);
        return <li key={section.href}>
          <Link href={section.href} aria-current={current ? "page" : undefined} className={`${styles.link} ${current ? styles.current : ""}`}>
            {current ? <SelectionPill layoutId="organization-section" className={styles.pill} /> : null}
            {section.label}
          </Link>
        </li>;
      })}
    </ul>
  </nav>;
}
