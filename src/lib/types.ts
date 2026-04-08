export type Role = "admin" | "client";

export type User = {
  id: string;
  authUserId?: string | null;
  name: string;
  username: string;
  email: string;
  role: Role;
  whatsapp: string;
  active: boolean;
  clientId?: string | null;
  clientName?: string;
};

export type Client = {
  id: string;
  companyName: string;
  contactName: string;
  whatsapp: string;
  notes: string;
  active: boolean;
};

export type CampaignMetric = {
  amountSpent: string;
  reach: string;
  impressions: string;
  clicks: string;
  ctr: string;
  cpc: string;
  cpm: string;
  leads: string;
  costPerLead: string;
  roi: string;
  roas: string;
  frequency: string;
  periodLabel: string;
};

export type CampaignWithMetrics = {
  id: string;
  name: string;
  status: "Ativa" | "Pausada";
  platform: string;
  clientId?: string | null;
  clientName?: string;
  metrics: CampaignMetric;
};

export type CampaignPermission = {
  userId: string;
  campaignId: string;
};

export type PerformancePoint = {
  label: string;
  amountSpent: number;
  leads: number;
};

export type RawCampaignMetric = {
  campaignId: string;
  date: string;
  amountSpent: number;
  reach: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  leads: number;
  costPerLead: number;
  roi: number;
  roas: number;
  frequency: number;
};

export type ReportHistoryItem = {
  id: string;
  clientId?: string;
  clientName: string;
  whatsapp?: string;
  periodLabel: string;
  preview: string;
  generatedText?: string;
  createdAt?: string;
};

export type AppDataSnapshot = {
  users: User[];
  clients: Client[];
  campaigns: CampaignWithMetrics[];
  permissions: CampaignPermission[];
  reports: ReportHistoryItem[];
  metricRows: RawCampaignMetric[];
};

export type IntegrationProvider =
  | "meta_ads"
  | "gemini"
  | "supabase";

export type IntegrationSetting = {
  provider: IntegrationProvider;
  enabled: boolean;
  status: "connected" | "pending" | "not_configured";
  title: string;
  description: string;
  config: Record<string, string>;
};
