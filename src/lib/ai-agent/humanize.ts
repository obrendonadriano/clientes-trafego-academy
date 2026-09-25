// Humanização do envio: quebra a resposta da IA em mensagens curtas e sorteia
// os intervalos. Puro e sem dependências — dá para testar isoladamente.

const MAX_PARTS = 2;
const MAX_CHARS_PER_PART = 220;
const MAX_SENTENCES_PER_PART = 2;

// Uma pergunta só vira mensagem separada quando o que já está montado tem
// corpo. É o que mantém "Boa tarde! Tudo bem? 😊" junto, mas solta o
// "Qual é o veículo?" depois de uma frase de contexto.
const QUESTION_BREAK_MIN_CHARS = 30;

/** Frase que termina em "?", ignorando emojis e pontuação depois dele. */
function isQuestion(sentence: string) {
  return /\?["'”’)\]\s\p{Emoji}\p{P}]*$/u.test(sentence);
}

/**
 * Pedaço que começa com emoji/pontuação não é frase nova: é a cauda da frase
 * anterior. Sem isso, "Tudo bem? 😊 Vou..." mandaria o emoji para a mensagem
 * seguinte, que é exatamente o contrário do que se espera ler no WhatsApp.
 */
function reattachLeadingOrphans(sentences: string[]) {
  const result: string[] = [];

  for (const sentence of sentences) {
    const orphan = sentence.match(/^[^\p{L}\p{N}]+/u)?.[0] ?? "";
    const rest = sentence.slice(orphan.length);

    if (orphan.trim() && result.length > 0) {
      result[result.length - 1] =
        `${result[result.length - 1]} ${orphan.trim()}`;

      if (rest.trim()) {
        result.push(rest.trim());
      }

      continue;
    }

    result.push(sentence);
  }

  return result;
}

/** Separa em frases sem cortar no meio, preservando pontuação e emojis. */
function splitIntoSentences(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();

  if (!normalized) {
    return [];
  }

  // Quebra de linha do próprio modelo já é uma fronteira natural de mensagem.
  const blocks = normalized
    .split(/\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  const sentences: string[] = [];

  for (const block of blocks) {
    const parts = block
      .split(/(?<=[.!?…])\s+(?=\S)/u)
      .map((part) => part.trim())
      .filter(Boolean);

    sentences.push(
      ...reattachLeadingOrphans(parts.length > 0 ? parts : [block]),
    );
  }

  return sentences;
}

/** Agrupa as frases de UM texto em mensagens curtas. */
function splitSingleText(text: string): string[] {
  const sentences = splitIntoSentences(text);
  const parts: string[] = [];

  let current = "";
  let sentencesInCurrent = 0;

  const flush = () => {
    if (current) {
      parts.push(current);
      current = "";
      sentencesInCurrent = 0;
    }
  };

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    const question = isQuestion(sentence);

    const shouldBreakBefore =
      Boolean(current) &&
      (candidate.length > MAX_CHARS_PER_PART ||
        sentencesInCurrent >= MAX_SENTENCES_PER_PART ||
        (question && current.length >= QUESTION_BREAK_MIN_CHARS));

    if (shouldBreakBefore) {
      flush();
      current = sentence;
      sentencesInCurrent = 1;
    } else {
      current = candidate;
      sentencesInCurrent += 1;
    }

    // Uma pergunta fecha a mensagem: o que vier depois já é outro assunto.
    if (question) {
      flush();
    }
  }

  flush();
  return parts;
}

/**
 * Transforma a resposta da IA em mensagens curtas.
 *
 * Quando o modelo já devolve uma lista, cada item continua sendo uma mensagem
 * — ele acertou a segmentação e não cabe a nós desfazer. Cada item ainda passa
 * pelo teto de tamanho, e o total é limitado para uma resposta simples não
 * virar uma rajada de dez mensagens.
 */
export function splitReplyIntoMessages(reply: string | string[]): string[] {
  const items = Array.isArray(reply) ? reply : [reply];
  const parts = items.flatMap((item) => splitSingleText(String(item ?? "")));

  if (parts.length <= MAX_PARTS) {
    return parts;
  }

  // Excedeu o teto: o rabo da resposta vai junto na última mensagem.
  const head = parts.slice(0, MAX_PARTS - 1);
  head.push(parts.slice(MAX_PARTS - 1).join(" "));
  return head;
}

function randomBetween(min: number, max: number) {
  if (max <= min) {
    return Math.max(0, min);
  }

  return Math.round(min + Math.random() * (max - min));
}

export type DelayConfig = {
  delayMinMs: number;
  delayMaxMs: number;
  messageGapMinMs: number;
  messageGapMaxMs: number;
};

/**
 * Sorteia o intervalo de cada mensagem. A primeira usa a janela inicial
 * (1,5–4s por padrão) e as seguintes a janela entre mensagens (0,8–2,2s). Texto
 * mais longo pede um pouco mais de tempo, como se estivesse sendo digitado,
 * mas o acréscimo é limitado para não travar a conversa.
 */
export function buildDelaysForMessages(
  messages: string[],
  config: DelayConfig,
): number[] {
  return messages.map((message, index) => {
    const base =
      index === 0
        ? randomBetween(config.delayMinMs, config.delayMaxMs)
        : randomBetween(config.messageGapMinMs, config.messageGapMaxMs);

    // A primeira resposta recebe até 2,5s adicionais conforme o tamanho.
    const typingBonus =
      index === 0 ? Math.min(2500, Math.max(0, message.length - 80) * 20) : 0;

    return Math.min(30_000, base + typingBonus);
  });
}
