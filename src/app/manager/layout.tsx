import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export default function ManagerLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <WorkspaceShell role="manager">{children}</WorkspaceShell>;
}
