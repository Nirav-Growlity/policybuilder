import { redirect } from "next/navigation";
import { getPolicyCraftAuth } from "@/lib/policycraft-auth";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const auth = await getPolicyCraftAuth();
  if (!auth) redirect("/login?next=/drafts");
  return children;
}
