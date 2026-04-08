import { ClientDashboard } from "@/components/dashboard/client-dashboard";
import { getCurrentUser } from "@/lib/auth/session";
import { getClientDashboardData } from "@/lib/data/queries";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const data = await getClientDashboardData(user);

  return <ClientDashboard user={user} {...data} />;
}
