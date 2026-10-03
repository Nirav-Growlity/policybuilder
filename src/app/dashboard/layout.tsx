import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <WorkspaceShell role="user">{children}</WorkspaceShell>;
}
