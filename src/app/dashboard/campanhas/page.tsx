import { ClientCampaignsPage } from "@/components/dashboard/client-campaigns-page";
import { getCurrentUser } from "@/lib/auth/session";
import { getClientDashboardData } from "@/lib/data/queries";

export default async function DashboardCampaignsPage() {
  const user = await getCurrentUser();
  const data = await getClientDashboardData(user);

  return <ClientCampaignsPage user={user} {...data} />;
}
