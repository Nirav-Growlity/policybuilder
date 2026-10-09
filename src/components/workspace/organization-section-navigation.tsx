"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ApplicationSurface } from "@/components/ui/application-surface";
import styles from "./organization-section-navigation.module.css";

const sections = [
  { href: "/admin/organizations", label: "Normal organizations", exact: true },
  { href: "/admin/organizations/policycraft", label: "PolicyCraft organizations", exact: false },
];

export function OrganizationSectionNavigation() {
  const pathname = usePathname();

  return <ApplicationSurface className={styles.surface}>
    <nav aria-label="Organization areas" className={styles.navigation}>
      <ul className={styles.links}>
        {sections.map((section) => {
          const current = section.exact ? pathname === section.href : pathname === section.href || pathname.startsWith(`${section.href}/`) || /^\/admin\/organizations\/(?:new|\d+)(?:\/|$)/.test(pathname);
          return <li key={section.href}>
            <Link href={section.href} aria-current={current ? "page" : undefined} className={styles.link}>
              {section.label}
            </Link>
          </li>;
        })}
      </ul>
    </nav>
  </ApplicationSurface>;
}
