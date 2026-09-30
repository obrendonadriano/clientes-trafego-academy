// Segmentos (nichos) de cliente, escolhidos pelo admin no cadastro.

export type ClientSegmentValue =
  | "veiculo_atrasado"
  | "veiculo_quitacao"
  | "eventos"
  | "agencia_marketing"
  | "outro";

export const CLIENT_SEGMENTS: { value: ClientSegmentValue; label: string }[] = [
  {
    value: "veiculo_atrasado",
    label: "Compra de veículo com financiamento atrasado",
  },
  { value: "veiculo_quitacao", label: "Quitação de financiamento de veículo" },
  { value: "eventos", label: "Eventos / convites" },
  {
    value: "agencia_marketing",
    label: "Agência / Gestão de tráfego e marketing",
  },
  { value: "outro", label: "Outro (descrever)" },
];


// Nome legível do segmento (ou null se não houver).
export function getSegmentLabel(segment?: string | null): string | null {
  if (!segment) {
    return null;
  }

  return CLIENT_SEGMENTS.find((item) => item.value === segment)?.label ?? null;
}
