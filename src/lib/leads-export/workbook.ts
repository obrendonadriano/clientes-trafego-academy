import ExcelJS from "exceljs";
import { LEADS_COLUMNS, type ExportRow } from "./format";

// Planilha da exportação unificada. Aba "Leads" (uma linha por lead) e aba
// "Resumo" com COUNTIFS sobre a aba Leads — fórmulas, não valores fixos.

const HEADER_FILL = "FF1F4E78";
const FONT = "Arial";

const WIDTHS: Record<(typeof LEADS_COLUMNS)[number], number> = {
  Cliente: 24,
  Origem: 16,
  Campanha: 11,
  Anúncio: 14,
  "Data/Hora": 17,
  Nome: 26,
  Telefone: 17,
  "Status do lead": 26,
  Plataforma: 12,
  Banco: 18,
  "Valor da parcela": 22,
  "Parcelas em atraso": 20,
  "Parcelas pagas": 16,
  "Situação do financiamento": 26,
  "Prioridade (Meta)": 17,
  "Telefone repetido?": 18,
  Conjunto: 28,
  "Nome da campanha": 44,
  Formulário: 28,
  "ID do lead": 38,
  "ID do anúncio": 20,
};

function styleHeader(sheet: ExcelJS.Worksheet, columnCount: number) {
  const header = sheet.getRow(1);
  for (let index = 1; index <= columnCount; index += 1) {
    const cell = header.getCell(index);
    cell.font = { name: FONT, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle" };
  }
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

/** Critério de COUNTIFS que casa texto exato e também célula vazia. */
const criterion = (cell: string) => `${cell}&""`;

export async function buildLeadsWorkbook(rows: ExportRow[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Tráfego Academy";
  workbook.created = new Date();
  // O Excel recalcula as fórmulas do Resumo ao abrir.
  workbook.calcProperties.fullCalcOnLoad = true;

  // ---- Aba Leads ----
  const leads = workbook.addWorksheet("Leads");
  leads.columns = LEADS_COLUMNS.map((name) => ({
    header: name,
    key: name,
    width: WIDTHS[name],
  }));
  for (const row of rows) {
    // Célula sem informação fica realmente vazia (não "").
    const values = Object.fromEntries(
      LEADS_COLUMNS.map((name) => [name, row[name] ? row[name] : null]),
    );
    leads.addRow(values);
  }
  leads.eachRow((row) => {
    row.font = { name: FONT };
  });
  styleHeader(leads, LEADS_COLUMNS.length);
  leads.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rows.length + 1), column: LEADS_COLUMNS.length },
  };

  // ---- Aba Resumo ----
  const summary = workbook.addWorksheet("Resumo");
  const summaryColumns = ["Cliente", "Origem", "Campanha", "Anúncio", "Leads", "% do total"];
  summary.columns = summaryColumns.map((name, index) => ({
    header: name,
    key: name,
    width: [28, 18, 12, 16, 10, 12][index],
  }));

  const groups = new Map<string, [string, string, string, string]>();
  for (const row of rows) {
    const key = [row.Cliente, row.Origem, row.Campanha, row.Anúncio].join("\u0001");
    if (!groups.has(key)) groups.set(key, [row.Cliente, row.Origem, row.Campanha, row.Anúncio]);
  }
  const sorted = [...groups.values()].sort((a, b) =>
    a.join("\u0001").localeCompare(b.join("\u0001"), "pt-BR"),
  );

  const lastLeadRow = rows.length + 1;
  const range = (column: string) => `Leads!$${column}$2:$${column}$${Math.max(2, lastLeadRow)}`;
  const firstGroupRow = 2;
  const totalRow = firstGroupRow + sorted.length;

  sorted.forEach(([cliente, origem, campanha, anuncio], index) => {
    const r = firstGroupRow + index;
    const row = summary.getRow(r);
    row.getCell(1).value = cliente || null;
    row.getCell(2).value = origem || null;
    row.getCell(3).value = campanha || null;
    row.getCell(4).value = anuncio || null;
    row.getCell(5).value = {
      formula: `COUNTIFS(${range("A")},${criterion(`A${r}`)},${range("B")},${criterion(`B${r}`)},${range("C")},${criterion(`C${r}`)},${range("D")},${criterion(`D${r}`)})`,
    };
    row.getCell(6).value = { formula: `IF($E$${totalRow}=0,0,E${r}/$E$${totalRow})` };
    row.getCell(6).numFmt = "0.0%";
  });

  const total = summary.getRow(totalRow);
  total.getCell(1).value = "Total";
  total.getCell(5).value =
    sorted.length > 0 ? { formula: `SUM(E${firstGroupRow}:E${totalRow - 1})` } : 0;
  total.getCell(6).value = { formula: `IF(E${totalRow}=0,0,1)` };
  total.getCell(6).numFmt = "0.0%";
  total.font = { name: FONT, bold: true };

  summary.eachRow((row, number) => {
    if (number !== totalRow) row.font = { name: FONT };
  });
  styleHeader(summary, summaryColumns.length);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
