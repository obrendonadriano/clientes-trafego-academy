// Impostos que a Meta cobra sobre a veiculação de anúncios no Brasil.
// Eles NÃO aparecem no Gerenciador de Anúncios (que mostra só a veiculação),
// mas entram na nota fiscal — por isso o painel soma os dois ao investimento.
// Fonte oficial: Central de Ajuda da Meta para Empresas.
export const META_TAX_INFO_URL =
  "https://pt-br.facebook.com/business/help/471651647527469";

export const PIS_COFINS_RATE = 0.0925;
export const ISS_RATE = 0.029;
export const META_TAX_RATE = PIS_COFINS_RATE + ISS_RATE; // 12,15%

export function formatRate(rate: number) {
  return `${(rate * 100).toFixed(2).replace(".", ",")}%`;
}

export type TaxBreakdown = {
  // Valor de veiculação vindo da Meta, sem impostos.
  net: number;
  pisCofins: number;
  iss: number;
  taxTotal: number;
  // Veiculação + impostos: o que de fato é cobrado.
  gross: number;
};

export function breakdownMetaTaxes(net: number): TaxBreakdown {
  const pisCofins = net * PIS_COFINS_RATE;
  const iss = net * ISS_RATE;

  return {
    net,
    pisCofins,
    iss,
    taxTotal: pisCofins + iss,
    gross: net + pisCofins + iss,
  };
}

// Atalho para os pontos que só precisam do valor final.
export function withMetaTaxes(net: number) {
  return net * (1 + META_TAX_RATE);
}
