import type { StepDef } from "./types";

export const STEPS: StepDef[] = [
  { id: "setup", label: "Company setup", desc: "Enter company details and policy metadata", icon: "Building2" },
  { id: "declaration", label: "Declaration & scope", desc: "Write the preface, declaration and scope", icon: "ScrollText" },
  { id: "focus", label: "Key focus areas", desc: "Define what this policy covers", icon: "Target" },
  { id: "qualitative", label: "Qualitative objectives", desc: "Set qualitative goals per focus area", icon: "ListChecks" },
  { id: "quantitative", label: "Quantitative targets", desc: "Set measurable targets with deadlines", icon: "BarChart3" },
  { id: "sdg", label: "SDG alignment", desc: "Link to UN Sustainable Development Goals", icon: "Globe2" },
  { id: "responsibilities", label: "Responsibilities", desc: "Assign roles and review mechanism", icon: "Users" },
  { id: "export", label: "Preview & export", desc: "Review and download your policy", icon: "Download" },
];

export const STANDARDS = [
  "EcoVadis",
  "CDP",
  "GRI",
  "BRSR",
  "CSRD",
  "UNGC",
  "ISO 14001",
  "ISO 45001",
  "ISO 26000",
  "SA8000",
  "SDGs",
  "TCFD",
  "SBTi",
  "RBA",
];

export const FOCUS_AREAS_DEFAULT = [
  "Energy Consumption & GHG Emissions",
  "Air Emissions Control",
  "Raw Materials & Resource Efficiency",
  "Waste Management & Circularity",
  "Water Stewardship",
  "Biodiversity & Land Use",
  "Climate Risk & Emergency Preparedness",
  "Product End-of-Life & Environmental Stewardship",
];

export const RESPONSIBILITIES_DEFAULT: { role: string; duty: string }[] = [
  {
    role: "Board & Senior Management",
    duty:
      "Provide strategic direction, approve the policy, allocate resources, and review environmental performance at the highest level.",
  },
  {
    role: "EHS / Sustainability Team",
    duty:
      "Maintain the environmental management system, ensure regulatory compliance, track KPIs, coordinate audits, and report progress to leadership.",
  },
  {
    role: "Production & Operations",
    duty:
      "Implement energy, water and waste management initiatives on the shop floor, maintain pollution control equipment, and minimize process losses.",
  },
  {
    role: "Procurement & Supply Chain",
    duty:
      "Engage suppliers on sustainability criteria, source environmentally responsible materials, and integrate ESG clauses into contracts.",
  },
  {
    role: "All Employees",
    duty:
      "Follow environmental procedures, identify improvement opportunities, participate in training, and report incidents or concerns.",
  },
  {
    role: "Contractors & Visitors",
    duty:
      "Comply with site environmental rules, follow safe handling and waste segregation practices, and report any observed non-conformities.",
  },
];

export const SDG_DATA: { n: number; label: string; c: string }[] = [
  { n: 1, label: "No Poverty", c: "#E5243B" },
  { n: 2, label: "Zero Hunger", c: "#DDA63A" },
  { n: 3, label: "Good Health", c: "#4C9F38" },
  { n: 4, label: "Quality Education", c: "#C5192D" },
  { n: 5, label: "Gender Equality", c: "#FF3A21" },
  { n: 6, label: "Clean Water", c: "#26BDE2" },
  { n: 7, label: "Clean Energy", c: "#FCC30B" },
  { n: 8, label: "Decent Work", c: "#A21942" },
  { n: 9, label: "Industry & Innovation", c: "#FD6925" },
  { n: 10, label: "Reduced Inequalities", c: "#DD1367" },
  { n: 11, label: "Sustainable Cities", c: "#FD9D24" },
  { n: 12, label: "Responsible Consumption", c: "#BF8B2E" },
  { n: 13, label: "Climate Action", c: "#3F7E44" },
  { n: 14, label: "Life Below Water", c: "#0A97D9" },
  { n: 15, label: "Life on Land", c: "#56C02B" },
  { n: 16, label: "Peace & Justice", c: "#00689D" },
  { n: 17, label: "Partnerships", c: "#19486A" },
];

export const POLICY_TYPE_META = {
  id: "environmental" as const,
  label: "Environmental Policy",
  short: "Environmental",
  icon: "Leaf",
  accent: "#1a5c3a",
  accentSoft: "#e8f1eb",
};
