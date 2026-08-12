import type { PolicyType, Responsibility, StepDef } from "./types";

export const STEPS: StepDef[] = [
  { id: "structure", label: "Document structure", desc: "Arrange the sections in your policy", icon: "FileText" },
  { id: "declaration", label: "Declaration & scope", desc: "Write the preface, declaration and scope", icon: "ScrollText" },
  { id: "focus", label: "Key focus areas", desc: "Define what this policy covers", icon: "Target" },
  { id: "qualitative", label: "Qualitative objectives", desc: "Set qualitative goals per focus area", icon: "ListChecks" },
  { id: "quantitative", label: "Quantitative targets", desc: "Set measurable targets with deadlines", icon: "BarChart3" },
  { id: "sdg", label: "SDG alignment", desc: "Link to UN Sustainable Development Goals", icon: "Globe2" },
  { id: "responsibilities", label: "Responsibilities", desc: "Assign roles and review mechanism", icon: "Users" },
  { id: "custom", label: "Custom sections", desc: "Write added policy sections", icon: "Edit3" },
  { id: "export", label: "Preview & export", desc: "Review and download your policy", icon: "Download" },
];

export const STANDARDS: string[] = [];

export const INDUSTRY_SUBSECTORS: Record<string, string[]> = {
  "Food & Beverage": ["Distilling, rectifying and blending of spirits", "Manufacture of dairy products", "Manufacture of grain mill products, starches and starch products", "Manufacture of malt liquors and malt", "Manufacture of other food products", "Manufacture of prepared animal feeds", "Manufacture of soft drinks; production of mineral waters and other bottled waters", "Manufacture of vegetable and animal oils and fats", "Manufacture of wines", "Processing and preserving of fish, crustaceans and molluscs", "Processing and preserving of fruit and vegetables", "Processing and preserving of meat"],
  "Manufacturing Light": ["Manufacture of corrugated paper and paperboard", "Manufacture of footwear", "Manufacture of furniture", "Manufacture of games and toys", "Manufacture of jewellery, bijouterie and related articles", "Manufacture of luggage, handbags and the like", "Manufacture of medical and dental instruments and supplies", "Manufacture of other textiles", "Manufacture of pulp, paper and paperboard", "Manufacture of wearing apparel", "Manufacture of wood and products of wood and cork", "Other manufacturing n.e.c.", "Printing and service activities related to printing", "Repair and installation of machinery and equipment", "Spinning, weaving and finishing of textiles"],
  "Manufacturing Heavy": ["Casting of metals", "Cutting, shaping and finishing of stone", "Electricity, gas, steam and air conditioning supply", "Manufacture of basic chemicals, fertilizers and plastics", "Manufacture of basic iron and steel", "Manufacture of basic pharmaceutical products and preparations", "Manufacture of cement, lime and plaster", "Manufacture of coke and refined petroleum products", "Manufacture of glass and glass products", "Manufacture of other chemical products n.e.c.", "Manufacture of plastics products", "Manufacture of rubber products", "Materials recovery", "Remediation and waste management services", "Water collection, treatment and supply"],
  "Manufacturing Advanced": ["Building of ships and boats", "Manufacture of air and spacecraft machinery", "Manufacture of batteries and accumulators", "Manufacture of communication equipment", "Manufacture of computers and peripheral equipment", "Manufacture of consumer electronics", "Manufacture of electric motors, generators and transformers", "Manufacture of electronic components and boards", "Manufacture of motor vehicles", "Manufacture of other electrical equipment", "Manufacture of railway locomotives and rolling stock", "Manufacture of special-purpose machinery", "Treatment and coating of metals; machining"],
  Construction: ["Building completion and finishing", "Construction of buildings", "Construction of other civil engineering projects", "Construction of roads and railways", "Construction of utility projects", "Demolition and site preparation", "Electrical, plumbing and other construction installation activities", "Other specialized construction activities"],
  "Wholesale, Services, Professionals": ["Accommodation", "Advertising and market research", "Architectural and engineering activities; technical testing and analysis", "Food and beverage service activities", "Non-specialized wholesale trade", "Scientific research and development", "Security and investigation activities", "Travel agency and tour operator activities", "Wholesale of food, beverages and tobacco", "Wholesale of machinery and equipment"],
  Transport: ["Freight air transport", "Freight transport by road", "Inland water transport", "Passenger air transport", "Postal, courier and multi-modal freight transport activities", "Sea and coastal water transport", "Transport via pipeline", "Transport via railways", "Warehousing and storage"],
  ICT: ["Book publishing", "Computer programming, consultancy and related activities", "Data processing, hosting and web portals", "Programming and broadcasting activities", "Software publishing", "Telecommunications"],
  "Finance, Legal, Consulting": ["Management consultancy activities", "Financial service activities", "Insurance, reinsurance and pension funding", "Legal and accounting activities", "Real estate activities"],
  "Primary materials": ["Animal production", "Aquaculture", "Extraction of crude petroleum and natural gas", "Fishing", "Forestry and logging", "Mining of coal and lignite", "Mining of metal ores", "Quarrying of stone, sand and clay"],
  "Non-classified": ["Higher education", "Human health activities", "Other education", "Other personal service activities n.e.c.", "Residential care activities", "Sports and recreation activities"],
};

export const INDUSTRY_SECTORS = Object.keys(INDUSTRY_SUBSECTORS);

export const FRAMEWORK_ALIGNMENT: Record<string, string> = {};

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
  icon: "Leaf" as const,
  accent: "#1a5c3a",
  accentSoft: "#e8f1eb",
};

export interface PolicyProfile {
  id: PolicyType;
  label: string;
  short: string;
  icon: "Leaf" | "Users" | "BadgeIndianRupee";
  accent: string;
  accentSoft: string;
  documentPrefix: string;
  exportName: string;
  standards: string[];
  focusAreas: string[];
  responsibilities: Responsibility[];
  sdgs: number[];
  definitionLabel?: string;
  definitionDescription?: string;
  aiRole: string;
}

const labourResponsibilities: Responsibility[] = [
  { role: "Board & Senior Management", duty: "Approve the policy, allocate resources, and review labour and human-rights performance." },
  { role: "Human Resources", duty: "Implement fair employment practices, maintain grievance channels, and track workforce commitments." },
  { role: "EHS & Operations", duty: "Maintain safe working conditions, address hazards, and ensure worker training and participation." },
  { role: "Procurement & Supply Chain", duty: "Apply human-rights due diligence to suppliers, contractors, and service providers." },
  { role: "All Employees", duty: "Treat colleagues with dignity, report concerns without retaliation, and uphold this policy." },
];

const livingWageResponsibilities: Responsibility[] = [
  { role: "Board & Senior Management", duty: "Approve the living-wage commitment and review progress against wage and benefit objectives." },
  { role: "Human Resources", duty: "Maintain wage benchmarks, implement equitable compensation, and administer wage-related grievance handling." },
  { role: "Finance & Payroll", duty: "Ensure accurate, timely, traceable payment and maintain records for compensation and statutory benefits." },
  { role: "Line Managers", duty: "Communicate compensation practices clearly and escalate concerns affecting employee welfare." },
  { role: "Employees & Workers", duty: "Use available channels to raise wage or benefit concerns without fear of retaliation." },
];

export const POLICY_PROFILES: Record<PolicyType, PolicyProfile> = {
  environmental: {
    ...POLICY_TYPE_META,
    documentPrefix: "ENV",
    exportName: "Environmental-Policy",
    standards: ["GRI", "SDGs", "ISO 14001"],
    focusAreas: FOCUS_AREAS_DEFAULT,
    responsibilities: RESPONSIBILITIES_DEFAULT,
    sdgs: [6, 7, 12, 13, 15],
    aiRole: "environmental policy documents",
  },
  "labour-human-rights": {
    id: "labour-human-rights", label: "Labour & Human Rights Policy", short: "Labour & Human Rights", icon: "Users",
    accent: "#7c3f1d", accentSoft: "#f8ede6", documentPrefix: "LHR", exportName: "Labour-and-Human-Rights-Policy",
    standards: ["EcoVadis", "UNGC", "ILO", "ISO 45001", "ISO 26000", "SA8000", "SDGs"],
    focusAreas: ["Occupational Health & Safety", "Fair Working Conditions, Hours & Benefits", "Social Dialogue & Freedom of Association", "Career Development & Training", "Child Labour, Forced Labour & Modern Slavery", "Non-Discrimination, Harassment & Inclusion", "Employee Wellbeing & Work-Life Balance", "Grievance Mechanisms & Non-Retaliation", "Supply-Chain & Stakeholder Human Rights"],
    responsibilities: labourResponsibilities, sdgs: [3, 4, 5, 8, 10, 16, 17], aiRole: "labour and human-rights policy documents",
  },
  "living-wage": {
    id: "living-wage", label: "Living Wage Policy", short: "Living Wage", icon: "BadgeIndianRupee",
    accent: "#315a8b", accentSoft: "#eaf1f8", documentPrefix: "LW", exportName: "Living-Wage-Policy",
    standards: ["EcoVadis", "UNGC", "ILO", "ISO 26000", "SA8000", "SDGs"],
    focusAreas: ["Living-Wage Benchmark & Methodology", "Legal Minimum-Wage Compliance", "Benefits, Allowances & Total Remuneration", "Pay Equity & Transparency", "Timely, Traceable Payment", "Employee & Contractor Coverage", "Periodic Review & Cost-of-Living Adjustment", "Wage Grievances & Corrective Action"],
    responsibilities: livingWageResponsibilities, sdgs: [1, 3, 5, 8, 10],
    definitionLabel: "Definition & Methodology", definitionDescription: "Define living wage, the benchmark used, what remuneration is covered, and when it is reviewed.", aiRole: "living-wage policy documents",
  },
};

export function getPolicyProfile(type: PolicyType): PolicyProfile {
  return POLICY_PROFILES[type];
}

export function getPolicySteps(type: PolicyType): StepDef[] {
  return STEPS.map((step) => step.id === "declaration" && type === "living-wage"
    ? { ...step, label: "Declaration, scope & methodology", desc: "Set the purpose, scope and living-wage methodology" }
    : step);
}
