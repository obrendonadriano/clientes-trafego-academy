import type { AiProfile } from "./config";

const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);

function joinList(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`;
}

/**
 * Regras do perfil em frases curtas, na voz do cliente. Mostrado na revisão
 * do quiz e no resumo do painel: o que está escrito aqui é exatamente o que a
 * política aplica (policy.profileRejection + effectiveQuestions).
 */
export function describeProfile(profile: AiProfile): string[] {
  const types = profile.vehicleTypes.length
    ? joinList(profile.vehicleTypes.map((type) => type.toLowerCase()))
    : "veículo";
  const lines = [`Compra ${types} com financiamento ativo.`];

  if (profile.overduePolicy === "overdue_only") {
    lines.push(
      profile.minOverdueInstallments
        ? `Só parcelas atrasadas, com pelo menos ${profile.minOverdueInstallments} em atraso.`
        : "Só parcelas atrasadas.",
    );
  } else if (profile.overduePolicy === "current_only") {
    lines.push("Só parcelas em dia.");
  } else if (profile.minOverdueInstallments) {
    lines.push(
      `Parcelas em dia ou atrasadas; se atrasadas, pelo menos ${profile.minOverdueInstallments}.`,
    );
  } else {
    lines.push("Parcelas em dia ou atrasadas.");
  }

  if (profile.minVehicleYear) lines.push(`Ano ${profile.minVehicleYear} ou mais novo.`);
  if (profile.maxDebtAmount) lines.push(`Dívida de até ${brl(profile.maxDebtAmount)}.`);
  if (profile.rejectedBanks.length)
    lines.push(`Não atende: ${joinList(profile.rejectedBanks)}.`);

  lines.push(
    "Quitado, sem veículo ou fora destes critérios: a IA não responde.",
  );
  return lines;
}
