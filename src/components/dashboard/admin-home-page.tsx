import { AdminOverview } from "@/components/dashboard/admin-overview";
import { RawCampaignMetric } from "@/lib/types";

type AdminHomePageProps = {
  clientCount: number;
  campaignCount: number;
  clientUserCount: number;
  permissionCount: number;
  activeClientCount: number;
  activeCampaignCount: number;
  metricRows: RawCampaignMetric[];
};

export function AdminHomePage(props: AdminHomePageProps) {
  return (
    <AdminOverview {...props} />
  );
}
