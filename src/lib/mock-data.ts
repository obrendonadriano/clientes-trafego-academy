import {
  AppDataSnapshot,
  CampaignWithMetrics,
  Client,
  PerformancePoint,
  RawCampaignMetric,
  ReportHistoryItem,
  SyncStatus,
  User,
} from "@/lib/types";

const users: Array<User & { password: string }> = [
  {
    id: "user-admin",
    authUserId: null,
    name: "Administrador Tráfego Academy",
    username: "admin",
    password: "admin",
    email: "admin@trafegoacademy.online",
    role: "admin",
    whatsapp: "+5511999990000",
    active: true,
    clientId: null,
  },
  {
    id: "user-alpha",
    authUserId: null,
    name: "Ana Paula",
    username: "ana",
    password: "cliente123",
    email: "ana@alphaclinic.com",
    role: "client",
    whatsapp: "+5511999990001",
    active: true,
    clientId: "client-alpha",
    clientName: "Alpha Clinic",
  },
  {
    id: "user-bravo",
    authUserId: null,
    name: "Bruno Costa",
    username: "bruno",
    password: "cliente123",
    email: "bruno@bravolegal.com",
    role: "client",
    whatsapp: "+5511999990002",
    active: true,
    clientId: "client-bravo",
    clientName: "Bravo Legal",
  },
];

const clients: Client[] = [
  {
    id: "client-alpha",
    companyName: "Alpha Clinic",
    contactName: "Ana Paula",
    whatsapp: "+5511999990001",
    notes: "Foco em geração de leads para procedimentos premium.",
    active: true,
  },
  {
    id: "client-bravo",
    companyName: "Bravo Legal",
    contactName: "Bruno Costa",
    whatsapp: "+5511999990002",
    notes: "Campanhas de captação para advocacia empresarial.",
    active: true,
  },
  {
    id: "client-charlie",
    companyName: "Charlie Educação",
    contactName: "Carla Mendes",
    whatsapp: "+5511999990003",
    notes: "Plano mensal em expansão nacional.",
    active: false,
  },
];

const campaigns: CampaignWithMetrics[] = [
  {
    id: "campaign-1",
    name: "Captação Lead Imersão",
    status: "Ativa",
    platform: "Meta Ads",
    clientId: "client-alpha",
    clientName: "Alpha Clinic",
    metrics: {
      amountSpent: "R$ 4.280",
      reach: "86.400",
      impressions: "124.900",
      clicks: "3.220",
      ctr: "2,58%",
      cpc: "R$ 1,33",
      cpm: "R$ 34,26",
      leads: "91",
      costPerLead: "R$ 47,03",
      roi: "182%",
      roas: "4,8x",
      frequency: "1,94",
      periodLabel: "Últimos 30 dias",
    },
  },
  {
    id: "campaign-2",
    name: "Remarketing Procedimentos",
    status: "Ativa",
    platform: "Google Ads",
    clientId: "client-alpha",
    clientName: "Alpha Clinic",
    metrics: {
      amountSpent: "R$ 2.940",
      reach: "42.300",
      impressions: "67.220",
      clicks: "1.680",
      ctr: "2,49%",
      cpc: "R$ 1,75",
      cpm: "R$ 43,73",
      leads: "38",
      costPerLead: "R$ 77,37",
      roi: "121%",
      roas: "3,7x",
      frequency: "2,41",
      periodLabel: "Últimos 30 dias",
    },
  },
  {
    id: "campaign-3",
    name: "Empresarial Search",
    status: "Ativa",
    platform: "Google Ads",
    clientId: "client-bravo",
    clientName: "Bravo Legal",
    metrics: {
      amountSpent: "R$ 5.260",
      reach: "38.240",
      impressions: "58.910",
      clicks: "2.110",
      ctr: "3,58%",
      cpc: "R$ 2,49",
      cpm: "R$ 89,29",
      leads: "57",
      costPerLead: "R$ 92,28",
      roi: "143%",
      roas: "4,2x",
      frequency: "1,52",
      periodLabel: "Últimos 30 dias",
    },
  },
];

const permissions = [
  { userId: "user-alpha", campaignId: "campaign-1" },
  { userId: "user-alpha", campaignId: "campaign-2" },
  { userId: "user-bravo", campaignId: "campaign-3" },
];

const performanceSeriesByUser: Record<string, PerformancePoint[]> = {
  "user-admin": [
    { label: "Semana 1", amountSpent: 22000, leads: 97 },
    { label: "Semana 2", amountSpent: 19800, leads: 88 },
    { label: "Semana 3", amountSpent: 24100, leads: 118 },
    { label: "Semana 4", amountSpent: 19020, leads: 103 },
  ],
  "user-alpha": [
    { label: "Semana 1", amountSpent: 2800, leads: 32 },
    { label: "Semana 2", amountSpent: 3150, leads: 45 },
    { label: "Semana 3", amountSpent: 2910, leads: 50 },
    { label: "Semana 4", amountSpent: 2360, leads: 59 },
  ],
  "user-bravo": [
    { label: "Semana 1", amountSpent: 1180, leads: 12 },
    { label: "Semana 2", amountSpent: 1470, leads: 15 },
    { label: "Semana 3", amountSpent: 1250, leads: 13 },
    { label: "Semana 4", amountSpent: 1360, leads: 17 },
  ],
};

const reportHistory: ReportHistoryItem[] = [
  {
    id: "report-1",
    clientId: "client-alpha",
    clientName: "Alpha Clinic",
    whatsapp: "+5511999990001",
    periodLabel: "01/04/2026 a 07/04/2026",
    preview:
      "A semana mostrou avanço consistente em leads qualificados, com destaque para a campanha de captação principal.",
    generatedText:
      "A semana mostrou avanço consistente em leads qualificados, com destaque para a campanha de captação principal.",
    createdAt: "2026-04-07T10:00:00.000Z",
  },
  {
    id: "report-2",
    clientId: "client-bravo",
    clientName: "Bravo Legal",
    whatsapp: "+5511999990002",
    periodLabel: "Março de 2026",
    preview:
      "O desempenho manteve ROAS saudável, mas ainda há espaço para reduzir CPC em grupos de anúncio específicos.",
    generatedText:
      "O desempenho manteve ROAS saudável, mas ainda há espaço para reduzir CPC em grupos de anúncio específicos.",
    createdAt: "2026-03-31T18:30:00.000Z",
  },
];

const metricRows: RawCampaignMetric[] = [
  {
    campaignId: "campaign-1",
    date: "2026-04-01",
    amountSpent: 980,
    reach: 18400,
    impressions: 26300,
    clicks: 690,
    ctr: 2.62,
    cpc: 1.42,
    cpm: 37.26,
    leads: 18,
    costPerLead: 54.44,
    roi: 154,
    roas: 4.3,
    frequency: 1.43,
  },
  {
    campaignId: "campaign-1",
    date: "2026-04-04",
    amountSpent: 1250,
    reach: 20500,
    impressions: 31400,
    clicks: 810,
    ctr: 2.58,
    cpc: 1.54,
    cpm: 39.81,
    leads: 23,
    costPerLead: 54.35,
    roi: 168,
    roas: 4.7,
    frequency: 1.53,
  },
  {
    campaignId: "campaign-1",
    date: "2026-04-08",
    amountSpent: 2050,
    reach: 23800,
    impressions: 37600,
    clicks: 1020,
    ctr: 2.71,
    cpc: 2.01,
    cpm: 54.52,
    leads: 31,
    costPerLead: 66.13,
    roi: 182,
    roas: 4.8,
    frequency: 1.72,
  },
  {
    campaignId: "campaign-2",
    date: "2026-04-02",
    amountSpent: 870,
    reach: 11200,
    impressions: 18600,
    clicks: 420,
    ctr: 2.26,
    cpc: 2.07,
    cpm: 46.77,
    leads: 9,
    costPerLead: 96.67,
    roi: 108,
    roas: 3.1,
    frequency: 1.66,
  },
  {
    campaignId: "campaign-2",
    date: "2026-04-06",
    amountSpent: 990,
    reach: 13400,
    impressions: 21400,
    clicks: 560,
    ctr: 2.62,
    cpc: 1.77,
    cpm: 46.26,
    leads: 13,
    costPerLead: 76.15,
    roi: 124,
    roas: 3.9,
    frequency: 1.82,
  },
  {
    campaignId: "campaign-2",
    date: "2026-04-08",
    amountSpent: 1080,
    reach: 14900,
    impressions: 27220,
    clicks: 700,
    ctr: 2.57,
    cpc: 1.54,
    cpm: 39.68,
    leads: 16,
    costPerLead: 67.5,
    roi: 131,
    roas: 4.1,
    frequency: 2.01,
  },
  {
    campaignId: "campaign-3",
    date: "2026-04-01",
    amountSpent: 1430,
    reach: 9600,
    impressions: 14800,
    clicks: 520,
    ctr: 3.51,
    cpc: 2.75,
    cpm: 96.62,
    leads: 13,
    costPerLead: 110,
    roi: 129,
    roas: 3.8,
    frequency: 1.34,
  },
  {
    campaignId: "campaign-3",
    date: "2026-04-05",
    amountSpent: 1710,
    reach: 12400,
    impressions: 19300,
    clicks: 720,
    ctr: 3.73,
    cpc: 2.38,
    cpm: 88.6,
    leads: 19,
    costPerLead: 90,
    roi: 143,
    roas: 4.2,
    frequency: 1.56,
  },
  {
    campaignId: "campaign-3",
    date: "2026-04-08",
    amountSpent: 2120,
    reach: 16240,
    impressions: 24810,
    clicks: 870,
    ctr: 3.51,
    cpc: 2.44,
    cpm: 85.45,
    leads: 25,
    costPerLead: 84.8,
    roi: 157,
    roas: 4.6,
    frequency: 1.66,
  },
];

const syncStatuses: SyncStatus[] = [
  {
    provider: "meta_ads",
    intervalMinutes: 15,
    status: "success",
    lastAttemptAt: "2026-04-08T15:45:00-03:00",
    lastSuccessAt: "2026-04-08T15:45:00-03:00",
    nextRunAt: "2026-04-08T16:00:00-03:00",
    message: "Sincronização automática preparada para importar campanhas e métricas da Meta Ads.",
  },
];

export function getMockSnapshot(): AppDataSnapshot {
  return {
    users: users.map((user) => ({
      id: user.id,
      authUserId: user.authUserId,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      whatsapp: user.whatsapp,
      active: user.active,
      clientId: user.clientId,
      clientName: user.clientName,
    })),
    clients,
    campaigns,
    permissions,
    reports: reportHistory,
    metricRows,
    syncStatuses,
  };
}

export function authenticateMockUser(username: string, password: string) {
  return (
    users.find(
      (user) =>
        (user.username.toLowerCase() === username.toLowerCase() ||
          user.email.toLowerCase() === username.toLowerCase()) &&
        user.password === password &&
        user.active,
    ) ?? null
  );
}

export function getUserById(userId: string) {
  const user = users.find((item) => item.id === userId);

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    authUserId: user.authUserId,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    whatsapp: user.whatsapp,
    active: user.active,
    clientId: user.clientId,
    clientName: user.clientName,
  };
}

export function getAllClients() {
  return clients;
}

export function getAllCampaigns() {
  return campaigns;
}

export function getCampaignsForUser(userId: string) {
  const allowedCampaigns = new Set(
    permissions
      .filter((permission) => permission.userId === userId)
      .map((permission) => permission.campaignId),
  );

  return campaigns.filter((campaign) => allowedCampaigns.has(campaign.id));
}

export function getPerformanceSeriesForUser(userId: string) {
  return performanceSeriesByUser[userId] ?? performanceSeriesByUser["user-alpha"];
}

export function getReportHistory() {
  return reportHistory;
}
