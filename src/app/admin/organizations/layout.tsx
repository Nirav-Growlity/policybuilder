import type { ReactNode } from "react";
import { OrganizationSectionNavigation } from "@/components/workspace/organization-section-navigation";

export default function OrganizationsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="mx-auto max-w-6xl">
    <OrganizationSectionNavigation />
    {children}
  </div>;
}
