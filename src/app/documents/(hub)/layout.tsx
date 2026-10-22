import { DocumentsWorkspace } from "@/components/documents/documents-workspace";

export default function DocumentsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <DocumentsWorkspace>{children}</DocumentsWorkspace>;
}
