// Segmentos (nichos) de cliente. O conhecimento profundo de cada nicho fica
// aqui e é injetado no prompt do Gemini, para a IA falar a língua do negócio e
// nomear o "resultado" corretamente. O admin só escolhe o segmento no cadastro.

export type ClientSegmentValue =
  | "veiculo_atrasado"
  | "veiculo_quitacao"
  | "eventos"
  | "outro";

export const CLIENT_SEGMENTS: { value: ClientSegmentValue; label: string }[] = [
  {
    value: "veiculo_atrasado",
    label: "Compra de veículo com financiamento atrasado",
  },
  { value: "veiculo_quitacao", label: "Quitação de financiamento de veículo" },
  { value: "eventos", label: "Eventos / convites" },
  { value: "outro", label: "Outro (descrever)" },
];

// Contexto rico por nicho, escrito para orientar o Gemini.
const SEGMENT_CONTEXT: Record<
  Exclude<ClientSegmentValue, "outro">,
  string
> = {
  veiculo_atrasado: `CONTEXTO DO NEGÓCIO DESTE CLIENTE: ele atua na COMPRA de veículos de pessoas que financiaram um carro e não estão conseguindo pagar as parcelas — estão com o financiamento em atraso, muitas vezes sob risco de Renajud, busca e apreensão do veículo. As campanhas são de MENSAGENS no WhatsApp: encontram essas pessoas e iniciam uma conversa para negociar e comprar o veículo delas, dando uma saída para a dívida. Portanto, o "resultado"/"lead" de cada campanha é uma CONVERSA iniciada no WhatsApp por um dono de veículo nessa situação — cada conversa é uma oportunidade real de compra de um carro. Ao escrever, refira-se ao resultado como "pessoas interessadas que chamaram no WhatsApp" ou "conversas de donos de veículos querendo negociar", NUNCA como "vendas". Fale de forma simples e humana sobre quantas dessas oportunidades chegaram, o investimento e o custo por conversa, valorizando a chegada de contatos qualificados desse público específico.`,
  veiculo_quitacao: `CONTEXTO DO NEGÓCIO DESTE CLIENTE: ele vende uma SOLUÇÃO/SERVIÇO para ajudar pessoas a QUITAR a dívida do financiamento do veículo pagando muito menos do que devem (economias que podem chegar a cerca de 80% a menos). O público são pessoas endividadas no financiamento do carro que querem se livrar da dívida gastando menos. As campanhas geram CONVERSAS no WhatsApp / contatos dessas pessoas interessadas em quitar. Portanto, o "resultado"/"lead" é um contato/conversa de alguém interessado em quitar o financiamento. Ao escrever, refira-se ao resultado como "pessoas interessadas em quitar o financiamento" ou "contatos de quem quer quitar a dívida", NUNCA como "vendas". Fale de forma simples sobre o volume de interessados que chegaram, o investimento e o custo por interessado, valorizando o alcance de quem realmente precisa dessa solução.`,
  eventos: `CONTEXTO DO NEGÓCIO DESTE CLIENTE: ele trabalha com EVENTOS — vende convites/ingressos para festas, shows e eventos em geral. O objetivo das campanhas é divulgar o evento e gerar venda de convites/ingressos ou interesse de pessoas que querem comprar. Portanto, o "resultado" são convites/ingressos vendidos ou pessoas interessadas em comprar o ingresso. Ao escrever, fale sobre o alcance da divulgação do evento, o número de interessados/convites e o investimento, com um tom animado, simples e convidativo, adequado ao universo de festas e shows.`,
};

// Monta o bloco de contexto do segmento para o prompt (ou null se não houver).
export function getSegmentPromptContext(
  segment?: string | null,
  description?: string | null,
): string | null {
  const extra = (description ?? "").trim();

  if (segment === "outro") {
    return extra
      ? `CONTEXTO DO NEGÓCIO DESTE CLIENTE (descrito pelo gestor): ${extra}`
      : null;
  }

  const context = segment
    ? SEGMENT_CONTEXT[segment as keyof typeof SEGMENT_CONTEXT]
    : undefined;

  if (!context) {
    return null;
  }

  return extra
    ? `${context}\nObservação adicional do gestor sobre este cliente: ${extra}`
    : context;
}

export function getSegmentLabel(segment?: string | null): string | null {
  if (!segment) {
    return null;
  }

  return CLIENT_SEGMENTS.find((item) => item.value === segment)?.label ?? null;
}
