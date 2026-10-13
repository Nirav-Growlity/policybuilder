"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SelectionPill } from "@/components/workspace/workspace-motion";
import styles from "./organization-section-navigation.module.css";

const sections = [
  { href: "/admin/organizations", label: "Normal organizations", exact: true },
  { href: "/admin/organizations/policycraft", label: "PolicyCraft organizations", exact: false },
];

/** Section switcher that sits on the masthead's ink band, inside the page hero. */
export function OrganizationSectionNavigation() {
  const pathname = usePathname();

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
