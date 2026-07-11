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
  // Nicho do cliente (chave pré-definida ou "outro") + descrição livre quando
  // "outro". Alimenta o contexto da IA nos relatórios.
  segment?: string;
  segmentDescription?: string;
};

export type CampaignMetric = {
  amountSpent: string;
  reach: string;
  impressions: string;
  clicks: string;
  ctr: string;
  results: string;
  resultLabel: string;
  cpc: string;
  cpm: string;
  leads: string;
  costPerLead: string;
  roi: string;
  roas: string;
  frequency: string;
  periodLabel: string;
  // Moeda original (ex.: "USD") e valores na moeda original, preenchidos só
  // quando a conta é em moeda estrangeira. Em conta BRL ficam indefinidos.
  currency?: string;
  amountSpentOriginal?: string;
  cpcOriginal?: string;
  cpmOriginal?: string;
  costPerLeadOriginal?: string;
};

export type CampaignWithMetrics = {
  id: string;
  name: string;
  status: "Ativa" | "Pausada";
  platform: string;
  clientId?: string | null;
  clientName?: string;
  // Categoria do resultado principal (derivada do objetivo da Meta).
  resultCategory?: string;
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
  granularity: "day" | "hour";
  hourBucket: number;
  hourLabel: string;
  amountSpent: number;
  reach: number;
  impressions: number;
  clicks: number;
  ctr: number;
  results: number;
  resultLabel: string;
  cpc: number;
  cpm: number;
  leads: number;
  costPerLead: number;
  roi: number;
  roas: number;
  frequency: number;
  // Moeda original da conta e taxa usada na conversão (1 quando já é BRL).
  // O valor na moeda original é amountSpent / exchangeRate. Opcionais para
  // compatibilidade com dados mock; mapMetricRow sempre preenche os reais.
  currency?: string;
  exchangeRate?: number;
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
  syncStatuses: SyncStatus[];
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

export type SyncStatus = {
  provider: IntegrationProvider;
  intervalMinutes: number;
  status: "pending" | "running" | "success" | "error";
  lastAttemptAt?: string | null;
  lastSuccessAt?: string | null;
  nextRunAt?: string | null;
  message?: string | null;
};

export type MetaAdAccount = {
  id: string;
  label: string;
  adAccountId: string;
  // Token próprio da conta; quando vazio, usa o token compartilhado da BM.
  hasOwnToken: boolean;
  enabled: boolean;
  status: "pending" | "ok" | "error";
  lastMessage?: string | null;
  lastSyncedAt?: string | null;
};
