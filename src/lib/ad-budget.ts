// Verba x Gasto: cruza o que cada cliente PAGOU de verba de anúncio (sistema
// de controle) com o que a Meta COBROU (gasto + 12,15% de impostos).
//
// Este arquivo é só cálculo, sem acesso a banco — os dados chegam prontos de
// `src/lib/data/ad-budget.ts`, e os testes importam daqui direto.
//
// Regras combinadas com o negócio:
//   • Verba paga = soma de `trafficAdditional` das parcelas pagas (é a parte de
//     verba; honorários ficam de fora).
//   • Gasto real = gasto da Meta × (1 + 12,15%), que é o que sai da fatura.
//   • Saldo = verba paga − gasto real, acumulado desde a primeira verba paga
//     do cliente no controle (antes disso o controle não existia).
//   • Orçamento diário recomendado = última verba × (1 − 12,15%) ÷ dias do
//     ciclo (normalmente 7). É a conta que o gestor já faz à mão.
//   • A conta antiga em dólar usa a cotação média real do cartão (5,15), não
//     a PTAX do dia, para o saldo bater com o dinheiro de verdade.

export const LEGACY_USD_RATE = 5.15;
// Margem antes de acusar ritmo acima do combinado (arredondamentos da Meta).
const PACE_TOLERANCE = 1.1;
// Diferença mínima, em reais, para considerar o saldo negativo.
const BALANCE_TOLERANCE = 1;
// Dias completos usados para medir o ritmo atual de gasto.
export const PACE_DAYS = 3;

export type ControlInstallment = {
  id: string;
  kind?: string;
  label?: string;
  dueDate?: string;
  paidDate?: string;
  trafficAdditional?: number | string;
};

export type ControlClient = {
  id: string;
  name?: string;
  company?: string;
  status?: string;
  installments?: ControlInstallment[];
};

export type BudgetDashboardClient = {
  id: string;
  name: string;
  code?: string;
  active: boolean;
};

export type BudgetCampaign = {
  id: string;
  clientId: string | null;
  active: boolean;
};

export type BudgetSpendRow = {
  campaignId: string;
  date: string;
  amountSpent: number;
  currency: string;
  exchangeRate: number;
};

export type BudgetStatus =
  | "estourado"
  | "acima"
  | "sem_pagamento"
  | "ok"
  | "parado";

export type BudgetRow = {
  code: string;
  clientId: string;
  clientName: string;
  clientActive: boolean;
  controlNames: string[];
  status: BudgetStatus;
  startDate: string;
  verbaPaid: number;
  spendNet: number;
  spendGross: number;
  balance: number;
  lastPaid: { date: string; amount: number } | null;
  cycleDays: number;
  recommendedDaily: number;
  paceDaily: number;
  todayNet: number;
  daysLeft: number | null;
  nextDue: { date: string; amount: number } | null;
  overdueVerba: number;
  activeCampaigns: number;
};

export type UnlinkedControlClient = {
  controlId: string;
  name: string;
  company: string;
  reason: "sem_codigo" | "codigo_desconhecido";
  code: string | null;
  verbaPaid: number;
};

export type SpendWithoutControl = {
  clientId: string;
  clientName: string;
  code: string | null;
  spendLast7: number;
};

export type BudgetReport = {
  generatedAt: string;
  today: string;
  taxRate: number;
  usdRate: number;
  rows: BudgetRow[];
  unlinked: UnlinkedControlClient[];
  withoutControl: SpendWithoutControl[];
  totals: {
    verbaPaid: number;
    spendGross: number;
    balance: number;
    estourados: number;
    acima: number;
    semPagamento: number;
  };
};

const STATUS_ORDER: Record<BudgetStatus, number> = {
  estourado: 0,
  acima: 1,
  sem_pagamento: 2,
  ok: 3,
  parado: 4,
};

// "1234 - Nome", "1234-Nome", "1234 Nome" → "1234". Só o prefixo conta.
export function parseControlCode(company: string | undefined | null) {
  const match = /^\s*(\d{4})(?!\d)/.exec(company ?? "");
  return match ? match[1] : null;
}

function money(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function isIsoDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function addDays(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
      86_400_000,
  );
}

// Gasto em reais. Linhas em dólar voltam ao valor original (o sync guarda a
// cotação usada) e são convertidas pela cotação média real do cartão.
export function spendInBrl(row: BudgetSpendRow, usdRate: number) {
  const amount = money(row.amountSpent);
  const currency = (row.currency || "BRL").toUpperCase();

  if (currency === "BRL") {
    return amount;
  }

  const rate = money(row.exchangeRate);
  if (currency === "USD" && rate > 0) {
    return (amount / rate) * usdRate;
  }

  return amount;
}

type VerbaInstallment = {
  amount: number;
  dueDate: string | null;
  paidDate: string | null;
};

function verbaInstallments(clients: ControlClient[]): VerbaInstallment[] {
  return clients.flatMap((client) =>
    (client.installments ?? [])
      .map((item) => ({
        amount: money(item.trafficAdditional),
        dueDate: isIsoDay(item.dueDate) ? item.dueDate : null,
        paidDate: isIsoDay(item.paidDate) ? item.paidDate : null,
      }))
      .filter((item) => item.amount > 0),
  );
}

// Dias do ciclo: mediana dos intervalos entre os vencimentos das últimas
// verbas pagas (semanal = 7, mensal ≈ 30). A mediana ignora uma recarga extra
// ou um atraso isolado. Sem histórico suficiente, assume semanal.
export function cycleDaysOf(paid: { dueDate: string | null; paidDate: string | null }[]) {
  const dues = [
    ...new Set(
      paid
        .map((item) => item.dueDate ?? item.paidDate)
        .filter((day): day is string => Boolean(day)),
    ),
  ]
    .sort()
    .slice(-6);

  const gaps = dues
    .slice(1)
    .map((day, index) => daysBetween(dues[index], day))
    .filter((gap) => gap >= 3)
    .sort((a, b) => a - b);

  if (gaps.length === 0) {
    return 7;
  }

  const middle = Math.floor(gaps.length / 2);
  const median =
    gaps.length % 2 === 1
      ? gaps[middle]
      : Math.round((gaps[middle - 1] + gaps[middle]) / 2);
  return Math.min(31, median);
}

export function computeBudgetReport(input: {
  controlClients: ControlClient[];
  dashboardClients: BudgetDashboardClient[];
  campaigns: BudgetCampaign[];
  spendRows: BudgetSpendRow[];
  today: string;
  taxRate: number;
  usdRate?: number;
  now?: Date;
}): BudgetReport {
  const usdRate = input.usdRate ?? LEGACY_USD_RATE;
  const { today, taxRate } = input;
  const grossFactor = 1 + taxRate;

  const clientByCode = new Map(
    input.dashboardClients
      .filter((client) => client.code)
      .map((client) => [client.code as string, client] as const),
  );

  // Clientes do controle agrupados pelo código (um cliente do dashboard pode
  // ter mais de um cadastro no controle, ex.: contrato renovado).
  const controlByCode = new Map<string, ControlClient[]>();
  const unlinked: UnlinkedControlClient[] = [];

  for (const client of input.controlClients) {
    const verba = verbaInstallments([client]);
    const verbaPaid = verba
      .filter((item) => item.paidDate)
      .reduce((sum, item) => sum + item.amount, 0);
    // Cadastro sem nenhuma verba (só honorários) não entra na conta.
    if (verba.length === 0) {
      continue;
    }

    const code = parseControlCode(client.company);

    if (!code || !clientByCode.has(code)) {
      unlinked.push({
        controlId: client.id,
        name: client.name ?? "",
        company: client.company ?? "",
        reason: code ? "codigo_desconhecido" : "sem_codigo",
        code,
        verbaPaid: round2(verbaPaid),
      });
      continue;
    }

    controlByCode.set(code, [...(controlByCode.get(code) ?? []), client]);
  }

  // Gasto por cliente e por dia, já em reais e sem impostos.
  const ownerByCampaign = new Map(
    input.campaigns
      .filter((campaign) => campaign.clientId)
      .map((campaign) => [campaign.id, campaign.clientId as string] as const),
  );
  const spendByClient = new Map<string, Map<string, number>>();

  for (const row of input.spendRows) {
    const clientId = ownerByCampaign.get(row.campaignId);
    if (!clientId || !isIsoDay(row.date)) {
      continue;
    }

    const days = spendByClient.get(clientId) ?? new Map<string, number>();
    days.set(row.date, (days.get(row.date) ?? 0) + spendInBrl(row, usdRate));
    spendByClient.set(clientId, days);
  }

  const activeCampaignsByClient = new Map<string, number>();
  for (const campaign of input.campaigns) {
    if (campaign.clientId && campaign.active) {
      activeCampaignsByClient.set(
        campaign.clientId,
        (activeCampaignsByClient.get(campaign.clientId) ?? 0) + 1,
      );
    }
  }

  const paceFrom = addDays(today, -PACE_DAYS);
  const yesterday = addDays(today, -1);
  const rows: BudgetRow[] = [];

  for (const [code, controls] of controlByCode) {
    const client = clientByCode.get(code)!;
    const verba = verbaInstallments(controls);
    const paid = verba.filter((item) => item.paidDate);
    const unpaid = verba.filter((item) => !item.paidDate);

    const verbaPaid = paid.reduce((sum, item) => sum + item.amount, 0);
    const startDate =
      paid
        .map((item) => [item.paidDate, item.dueDate])
        .flat()
        .filter((day): day is string => Boolean(day))
        .sort()[0] ?? today;

    const days = spendByClient.get(client.id) ?? new Map<string, number>();
    let spendNet = 0;
    let paceTotal = 0;
    let spendLast7 = 0;
    for (const [day, value] of days) {
      if (day >= startDate && day <= today) spendNet += value;
      if (day >= paceFrom && day <= yesterday) paceTotal += value;
      if (day > addDays(today, -7) && day <= today) spendLast7 += value;
    }
    const todayNet = days.get(today) ?? 0;
    const spendGross = spendNet * grossFactor;
    const balance = verbaPaid - spendGross;

    const lastPaidItem = [...paid].sort((a, b) =>
      (a.dueDate ?? a.paidDate ?? "").localeCompare(b.dueDate ?? b.paidDate ?? ""),
    ).at(-1);
    const lastPaid = lastPaidItem
      ? {
          date: lastPaidItem.paidDate as string,
          amount: round2(lastPaidItem.amount),
        }
      : null;
    const cycleDays = cycleDaysOf(paid);
    const recommendedDaily = lastPaidItem
      ? (lastPaidItem.amount * (1 - taxRate)) / cycleDays
      : 0;
    const paceDaily = paceTotal / PACE_DAYS;

    const nextDueItem = unpaid
      .filter((item) => item.dueDate)
      .sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string))
      .at(0);
    const overdueVerba = unpaid
      .filter((item) => item.dueDate && item.dueDate < today)
      .reduce((sum, item) => sum + item.amount, 0);

    const daysLeft =
      paceDaily > 0 ? Math.max(0, balance) / (paceDaily * grossFactor) : null;

    // Pagamento "recente" = dentro do ciclo + 3 dias de folga.
    const lastPaidDay = lastPaidItem?.paidDate ?? null;
    const paymentIsRecent =
      lastPaidDay !== null && daysBetween(lastPaidDay, today) <= cycleDays + 3;

    let status: BudgetStatus;
    if (balance < -BALANCE_TOLERANCE) {
      status = "estourado";
    } else if (
      recommendedDaily > 0 &&
      paceDaily > recommendedDaily * PACE_TOLERANCE
    ) {
      status = "acima";
    } else if (spendLast7 > 0 && !paymentIsRecent) {
      status = "sem_pagamento";
    } else if (paceDaily === 0 && todayNet === 0) {
      status = "parado";
    } else {
      status = "ok";
    }

    rows.push({
      code,
      clientId: client.id,
      clientName: client.name,
      clientActive: client.active,
      controlNames: controls.map((item) => item.name || item.company || ""),
      status,
      startDate,
      verbaPaid: round2(verbaPaid),
      spendNet: round2(spendNet),
      spendGross: round2(spendGross),
      balance: round2(balance),
      lastPaid,
      cycleDays,
      recommendedDaily: round2(recommendedDaily),
      paceDaily: round2(paceDaily),
      todayNet: round2(todayNet),
      daysLeft: daysLeft === null ? null : Math.floor(daysLeft * 10) / 10,
      nextDue: nextDueItem
        ? {
            date: nextDueItem.dueDate as string,
            amount: round2(nextDueItem.amount),
          }
        : null,
      overdueVerba: round2(overdueVerba),
      activeCampaigns: activeCampaignsByClient.get(client.id) ?? 0,
    });
  }

  rows.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.balance - b.balance,
  );

  // Clientes gastando na Meta sem nenhum pagamento ligado no controle.
  const linkedIds = new Set(rows.map((row) => row.clientId));
  const weekStart = addDays(today, -6);
  const withoutControl: SpendWithoutControl[] = [];
  for (const client of input.dashboardClients) {
    if (linkedIds.has(client.id)) continue;
    let spendLast7 = 0;
    for (const [day, value] of spendByClient.get(client.id) ?? []) {
      if (day >= weekStart && day <= today) spendLast7 += value;
    }
    if (spendLast7 > 0) {
      withoutControl.push({
        clientId: client.id,
        clientName: client.name,
        code: client.code ?? null,
        spendLast7: round2(spendLast7 * grossFactor),
      });
    }
  }
  withoutControl.sort((a, b) => b.spendLast7 - a.spendLast7);
  unlinked.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    today,
    taxRate,
    usdRate,
    rows,
    unlinked,
    withoutControl,
    totals: {
      verbaPaid: round2(rows.reduce((sum, row) => sum + row.verbaPaid, 0)),
      spendGross: round2(rows.reduce((sum, row) => sum + row.spendGross, 0)),
      balance: round2(rows.reduce((sum, row) => sum + row.balance, 0)),
      estourados: rows.filter((row) => row.status === "estourado").length,
      acima: rows.filter((row) => row.status === "acima").length,
      semPagamento: rows.filter((row) => row.status === "sem_pagamento").length,
    },
  };
}
