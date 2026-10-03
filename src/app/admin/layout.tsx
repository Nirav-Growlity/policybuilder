import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <WorkspaceShell role="admin">{children}</WorkspaceShell>;
}
