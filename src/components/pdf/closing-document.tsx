import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ClosingData } from "@/lib/data/closing";
import {
  formatRate,
  ISS_RATE,
  META_TAX_INFO_URL,
  META_TAX_RATE,
  PIS_COFINS_RATE,
} from "@/lib/taxes";

// Documento do fechamento. Usa as fontes padrão do PDF (Helvetica), que já
// cobrem os acentos do português — sem download de fonte no servidor.
const BRAND = "#6d5ce0";
const INK = "#1c1b2a";
const MUTED = "#6b7280";
const LINE = "#e3e4ee";

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 52,
    paddingHorizontal: 36,
    fontSize: 9,
    color: INK,
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: BRAND,
    paddingBottom: 10,
    marginBottom: 16,
  },
  brand: { fontSize: 15, fontFamily: "Helvetica-Bold", color: BRAND },
  brandSub: { fontSize: 8, color: MUTED, marginTop: 2 },
  docTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "right" },
  docMeta: { fontSize: 8, color: MUTED, textAlign: "right", marginTop: 3 },

  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    color: MUTED,
    marginBottom: 6,
    marginTop: 14,
  },

  summaryRow: { flexDirection: "row", gap: 8 },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 5,
    padding: 8,
  },
  summaryLabel: { fontSize: 7.5, color: MUTED },
  summaryValue: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 4 },

  table: { borderWidth: 1, borderColor: LINE, borderRadius: 5, marginTop: 6 },
  tableHead: {
    flexDirection: "row",
    backgroundColor: "#f4f4fa",
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexData: 1,
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  th: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: MUTED },
  td: { fontSize: 8.5 },
  colName: { flex: 3 },
  colNumber: { flex: 1.2, textAlign: "right" },

  totalsBox: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 5,
    padding: 10,
  },
  totalsLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  totalsLabel: { fontSize: 9, color: MUTED },
  totalsValue: { fontSize: 9 },
  grandLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: LINE,
  },
  grandLabel: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  grandValue: { fontSize: 14, fontFamily: "Helvetica-Bold", color: BRAND },

  note: { fontSize: 8, color: MUTED, lineHeight: 1.5, marginTop: 4 },
  link: { fontSize: 8, color: BRAND },

  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7.5, color: MUTED },
});

function money(value: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(Number.isFinite(value) ? value : 0);
}

function integer(value: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.round(value));
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export function ClosingDocument({ data }: { data: ClosingData }) {
  const isForeign = data.currency !== "BRL";

  return (
    <Document
      title={`Fechamento ${data.clientName} - ${data.periodLabel}`}
      author="Tráfego Academy"
      subject="Fechamento de investimento em anúncios"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.brand}>Tráfego Academy</Text>
            <Text style={styles.brandSub}>Gestão de tráfego pago</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>Fechamento do período</Text>
            <Text style={styles.docMeta}>{data.clientName}</Text>
            <Text style={styles.docMeta}>
              {data.periodLabel} · {data.dayCount}{" "}
              {data.dayCount === 1 ? "dia" : "dias"}
            </Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total do período</Text>
            <Text style={styles.summaryValue}>{money(data.taxes.gross)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Resultados</Text>
            <Text style={styles.summaryValue}>{integer(data.results)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Custo por resultado</Text>
            <Text style={styles.summaryValue}>
              {data.results > 0
                ? money(data.taxes.gross / data.results)
                : "—"}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>CAMPANHAS DO PERÍODO</Text>

        <View style={styles.table}>
          <View style={styles.tableHead} fixed>
            <Text style={[styles.th, styles.colName]}>Campanha</Text>
            <Text style={[styles.th, styles.colNumber]}>Veiculação</Text>
            <Text style={[styles.th, styles.colNumber]}>Resultados</Text>
            <Text style={[styles.th, styles.colNumber]}>Custo/result.</Text>
          </View>

          {data.campaigns.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={[styles.td, { flex: 1, color: MUTED }]}>
                Nenhuma campanha com investimento neste período.
              </Text>
            </View>
          ) : (
            data.campaigns.map((campaign) => (
              <View key={campaign.id} style={styles.tableRow} wrap={false}>
                <View style={styles.colName}>
                  <Text style={styles.td}>{campaign.name}</Text>
                  {campaign.clientName ? (
                    <Text style={{ fontSize: 7, color: MUTED, marginTop: 1 }}>
                      {campaign.clientName}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.td, styles.colNumber]}>
                  {money(campaign.amountSpent)}
                </Text>
                <View style={styles.colNumber}>
                  <Text style={styles.td}>{integer(campaign.results)}</Text>
                  <Text style={{ fontSize: 6.5, color: MUTED, marginTop: 1, textAlign: "right" }}>
                    {campaign.resultLabel}
                  </Text>
                </View>
                <Text style={[styles.td, styles.colNumber]}>
                  {campaign.results > 0 ? money(campaign.costPerResult) : "—"}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.totalsBox} wrap={false}>
          <View style={styles.totalsLine}>
            <Text style={styles.totalsLabel}>
              Veiculação de anúncios (valor da Meta)
            </Text>
            <Text style={styles.totalsValue}>{money(data.taxes.net)}</Text>
          </View>
          <View style={styles.totalsLine}>
            <Text style={styles.totalsLabel}>
              PIS/COFINS ({formatRate(PIS_COFINS_RATE)})
            </Text>
            <Text style={styles.totalsValue}>{money(data.taxes.pisCofins)}</Text>
          </View>
          <View style={styles.totalsLine}>
            <Text style={styles.totalsLabel}>
              ISS · Imposto Sobre Serviços ({formatRate(ISS_RATE)})
            </Text>
            <Text style={styles.totalsValue}>{money(data.taxes.iss)}</Text>
          </View>

          <View style={styles.grandLine}>
            <Text style={styles.grandLabel}>Total do período</Text>
            <Text style={styles.grandValue}>{money(data.taxes.gross)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>COMO LER ESTE FECHAMENTO</Text>

        <Text style={styles.note}>
          A linha &quot;Veiculação de anúncios&quot; é exatamente o valor que
          aparece no Gerenciador de Anúncios da Meta. Sobre ela incidem os
          impostos brasileiros ({formatRate(META_TAX_RATE)} no total), que a Meta
          cobra e discrimina na nota fiscal — por isso o total deste fechamento é
          maior do que o número mostrado dentro da plataforma.
        </Text>

        {isForeign ? (
          <Text style={styles.note}>
            {data.mixedCurrencies
              ? `Este período junta contas cobradas em reais e em ${data.currency}. Do total, ${money(data.foreignSpent)} vieram da conta em ${data.currency} — ${money(data.amountSpentOriginal, data.currency)} na moeda original. O gasto de cada dia foi convertido pela cotação de fechamento daquele dia, e a cotação média ponderada dessa parcela ficou em ${money(data.averageRate)}.`
              : `A conta de anúncio é cobrada em ${data.currency}. O gasto de cada dia foi convertido para reais pela cotação de fechamento daquele dia. No período, o total em moeda original foi ${money(data.amountSpentOriginal, data.currency)} e a cotação média ponderada ficou em ${money(data.averageRate)} por ${data.currency === "USD" ? "dólar" : data.currency}.`}
          </Text>
        ) : (
          <Text style={styles.note}>
            A conta de anúncio é cobrada em reais, então não há conversão de
            moeda neste período.
          </Text>
        )}

        <Text style={styles.note}>
          Explicação oficial da Meta sobre os impostos: {META_TAX_INFO_URL}
        </Text>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Gerado em {dateTime(data.generatedAt)} · Tráfego Academy
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Página ${pageNumber} de ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
