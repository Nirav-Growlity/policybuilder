import { BadgeIndianRupee, Leaf, PackageCheck, ShieldCheck, Users } from "lucide-react";
import type { PolicyProfile } from "@/lib/constants";

export const POLICY_ICONS: Record<PolicyProfile["icon"], typeof Leaf> = { Leaf, Users, BadgeIndianRupee, ShieldCheck, PackageCheck };
