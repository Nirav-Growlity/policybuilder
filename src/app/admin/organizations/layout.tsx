import type { ReactNode } from "react";

// Each organization page renders its own WorkspaceHero, which carries the section navigation,
// so the layout must not add anything above it.
export default function OrganizationsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <>{children}</>;
}
