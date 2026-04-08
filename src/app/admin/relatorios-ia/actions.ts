"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOptionalCurrentUser } from "@/lib/auth/session";
import {
  filterMetricsByRange,
  formatPeriodLabel,
  getDateRangeForPeriod,
  summarizeMetrics,
  type DashboardPeriodValue,
} from "@/lib/dashboard-metrics";
import { getAppSnapshot } from "@/lib/data/queries";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateGeminiAnalysis, generateMockGeminiAnalysis } from "@/lib/services/gemini";

export type GenerateReportState = {
  success?: string;
  error?: string;
  text?: string;
  whatsapp?: string;
};

const reportSchema = z.object({
  clientId: z.string().uuid("Selecione um cliente válido."),
  period: z.enum([
    "Hoje",
    "Ontem",
    "Últimos 7 dias",
    "Últimos 30 dias",
    "Este mês",
    "Mês passado",
    "Personalizado",
  ]),
  campaignIds: z.array(z.string().uuid()).min(1, "Selecione ao menos uma campanha."),
  customStart: z.string().optional(),
  customEnd: z.string().optional(),
});

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function buildPrompt(input: {
  clientName: string;
  campaignNames: string[];
  periodLabel: string;
  totals: ReturnType<typeof summarizeMetrics>;
}) {
  return `Você é um gestor de tráfego pago sênior da Tráfego Academy.

Gere uma análise em português do Brasil, profissional, humanizada, clara e fácil para cliente leigo entender.
Escreva em tom consultivo, seguro e positivo, como se estivesse apresentando um relatório de performance ao cliente.
Use estritamente os dados fornecidos abaixo. Não invente números, não extrapole resultados e não mencione melhorias, otimizações, alertas, problemas ou sugestões de ação para o cliente.
O texto deve valorizar o trabalho realizado, transmitir confiança e destacar os resultados de forma positiva e elegante.

Cliente: ${input.clientName}
Campanhas analisadas: ${input.campaignNames.join(", ")}
Período: ${input.periodLabel}

Métricas consolidadas:
- Investimento total: ${formatCurrency(input.totals.amountSpent)}
- Alcance: ${Math.round(input.totals.reach)}
- Impressões: ${Math.round(input.totals.impressions)}
- Cliques: ${Math.round(input.totals.clicks)}
- CTR médio: ${input.totals.ctr.toFixed(2)}%
- CPC médio: ${formatCurrency(input.totals.cpc)}
- CPM médio: ${formatCurrency(input.totals.cpm)}
- Leads/resultados: ${Math.round(input.totals.leads)}
- Custo por lead/resultado: ${formatCurrency(input.totals.costPerLead)}
- ROI médio: ${input.totals.roi.toFixed(2)}%
- ROAS médio: ${input.totals.roas.toFixed(2)}x
- Frequência média: ${input.totals.frequency.toFixed(2)}

Estrutura obrigatória da resposta:
1. Resumo executivo
2. Destaques da performance
3. Leitura consultiva para o cliente
4. Encerramento positivo

Regras obrigatórias:
- sempre tratar a campanha de forma positiva e profissional;
- usar apenas os números informados;
- não sugerir melhorias, testes, ajustes ou otimizações;
- não escrever alertas ou pontos negativos;
- não falar com tom técnico interno de gestor para cliente final.

Evite linguagem robótica.`;
}

export async function generateAiReportAction(
  _prevState: GenerateReportState,
  formData: FormData,
): Promise<GenerateReportState> {
  try {
    const parsed = reportSchema.safeParse({
      clientId: formData.get("clientId"),
      period: formData.get("period"),
      campaignIds: formData.getAll("campaignIds").map(String),
      customStart: formData.get("customStart"),
      customEnd: formData.get("customEnd"),
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message };
    }

    const snapshot = await getAppSnapshot();
    const client = snapshot.clients.find((item) => item.id === parsed.data.clientId);

    if (!client) {
      return { error: "Cliente não encontrado." };
    }

    const campaigns = snapshot.campaigns.filter((campaign) =>
      parsed.data.campaignIds.includes(campaign.id),
    );

    if (campaigns.length === 0) {
      return { error: "Nenhuma campanha válida foi selecionada." };
    }

    const range = getDateRangeForPeriod(parsed.data.period as DashboardPeriodValue, {
      start: parsed.data.customStart || "",
      end: parsed.data.customEnd || "",
    });
    const rows = filterMetricsByRange(
      snapshot.metricRows.filter((row) => parsed.data.campaignIds.includes(row.campaignId)),
      range,
    );

    if (rows.length === 0) {
      return {
        error:
          "Não existem métricas importadas para este cliente/campanhas no período selecionado.",
      };
    }

    const totals = summarizeMetrics(rows);
    const periodLabel = formatPeriodLabel(parsed.data.period as DashboardPeriodValue, {
      start: parsed.data.customStart || "",
      end: parsed.data.customEnd || "",
    });

    const prompt = buildPrompt({
      clientName: client.companyName,
      campaignNames: campaigns.map((campaign) => campaign.name),
      periodLabel,
      totals,
    });

    let text: string;

    try {
      text = await generateGeminiAnalysis(prompt);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao gerar análise com o Gemini.";

      return {
        error: message,
        text: generateMockGeminiAnalysis(),
        whatsapp: client.whatsapp,
      };
    }

    const adminClient = createSupabaseAdminClient();
    const currentUser = await getOptionalCurrentUser();

    if (adminClient) {
      const reportInsert = await adminClient.from("ai_reports").insert({
        client_id: client.id,
        user_id: currentUser?.id ?? null,
        period_start: range.start.toISOString().slice(0, 10),
        period_end: range.end.toISOString().slice(0, 10),
        generated_text: text,
        campaign_id: campaigns[0]?.id ?? null,
      });

      if (reportInsert.error) {
        return {
          error: `A análise foi gerada, mas não foi possível salvar o histórico: ${reportInsert.error.message}`,
          text,
          whatsapp: client.whatsapp,
        };
      }
    }

    revalidatePath("/admin/relatorios-ia");

    return {
      success: "Análise gerada com sucesso via Gemini.",
      text,
      whatsapp: client.whatsapp,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Ocorreu um erro inesperado ao gerar o relatório.";

    return {
      error: message,
      text: generateMockGeminiAnalysis(),
    };
  }
}
