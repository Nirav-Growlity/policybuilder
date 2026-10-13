import { OrganizationSectionNavigation } from "@/components/workspace/organization-section-navigation";
import { StandaloneOrganizationEditor } from "@/components/workspace/standalone-organization-editor";

export default function NewOrganizationPage() {
  return <StandaloneOrganizationEditor navigation={<OrganizationSectionNavigation />} />;
}
