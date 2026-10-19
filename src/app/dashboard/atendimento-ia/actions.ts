"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOptionalCurrentUser } from "@/lib/auth/session";
import { normalizeWhatsappNumber } from "@/lib/phone";
import {
  AI_AGENT_LIMITS,
  normalizeBrazilianWhatsapp,
  type AiConversationMessage,
} from "@/lib/ai-agent/shared";
import {
  AiAgentError,
  deleteConversation,
  ensureAiAgentSettings,
  findConversationById,
  getClientPlan,
  getClientSegment,
  getSessionForClient,
  listConversationMessages,
  updateAiAgentSettings,
} from "@/lib/ai-agent/store";
import {
  getWahaConfig,
  resolveWahaChatId,
  sendWahaText,
  setWahaTyping,
  WahaRequestError,
} from "@/lib/waha";
import { transition } from "@/lib/ai-agent/transitions";
import {
  addBlockedNumber,
  deleteBlockedNumber,
  updateBlockedNumber,
} from "@/lib/ai-agent/blocked";
import {
  DEFAULT_ACTIVATION,
  DEFAULT_PROFILE,
  MAX_ACTIVATION_PHRASES,
  normalizeActivationText,
  profileSchema,
  DEFAULT_SCRIPT,
  SCRIPT_QUESTIONS,
  SCRIPT_REPLIES,
  checkScriptInput,
  knowledgeSchema,
  scheduleSchema,
  type AiScript,
} from "@/lib/ai-agent/config";
import { hasAiAttendanceSegment } from "@/lib/segments";

export type AiAgentActionState = {
  success?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Porteiro de TODA ação desta área.
 *
 * Confirma, no servidor: sessão válida, papel de cliente ativo, vínculo com um
 * cliente e Plano Completo. Alterar o HTML, a requisição ou chamar a action
 * direto não contorna nada disso — e o banco ainda tem a própria trava por
 * trigger como última linha de defesa.
 */
async function requireCompletePlanClient() {
  const user = await getOptionalCurrentUser();

  if (!user || user.role !== "client" || !user.active || !user.clientId) {
    throw new AiAgentError(
      "Você não tem permissão para alterar o atendimento por IA.",
      403,
    );
  }

  const plan = await getClientPlan(user.clientId);

  if (plan !== "complete") {
    throw new AiAgentError(
      "O atendimento por IA é exclusivo do Plano Completo.",
      403,
    );
  }

  if (!hasAiAttendanceSegment(await getClientSegment(user.clientId))) {
    throw new AiAgentError(
      "O atendimento por IA está disponível apenas para compra e aquisição de veículos.",
      403,
    );
  }

  return { user, clientId: user.clientId };
}

function toState(error: unknown): AiAgentActionState {
  if (error instanceof AiAgentError) {
    return { error: error.message };
  }

  console.error("[ia/action] falha", {
    code: "action_failed",
  });

  return { error: "Não foi possível concluir esta operação. Tente novamente." };
}

function refresh() {
  revalidatePath("/dashboard/atendimento-ia");
}

// ---------------------------------------------------------------------------
// Ligar / desligar
// ---------------------------------------------------------------------------

export async function toggleAiAgentAction(
  _prevState: AiAgentActionState,
  formData: FormData,
): Promise<AiAgentActionState> {
  try {
    const { clientId } = await requireCompletePlanClient();
    const enabled = formData.get("enabled") === "true";

    if (enabled) {
      // Sem WhatsApp conectado a IA não teria por onde responder.
      const session = await getSessionForClient(clientId);

      if (session?.status !== "WORKING") {
        return {
          error:
            "Conecte seu WhatsApp antes de ativar o atendimento automático.",
        };
      }
    }

    await ensureAiAgentSettings(clientId);
    await updateAiAgentSettings(clientId, {
      enabled,
      disabled_by_plan_at: null,
    });

    refresh();
    return {
      success: enabled
        ? "Atendimento por IA ativado."
        : "Atendimento por IA desativado.",
    };
  } catch (error) {
    return toState(error);
  }
}

// ---------------------------------------------------------------------------
// WhatsApp de notificação
// ---------------------------------------------------------------------------

export async function saveNotificationNumberAction(
  _prevState: AiAgentActionState,
  formData: FormData,
): Promise<AiAgentActionState> {
  try {
    const { clientId } = await requireCompletePlanClient();
    const raw = String(formData.get("notificationWhatsapp") ?? "").trim();

    if (!raw) {
      await ensureAiAgentSettings(clientId);
      await updateAiAgentSettings(clientId, { notification_whatsapp: null });
      refresh();
      return { success: "Número de notificação removido." };
    }

    // Brasil ou outro país, identificado pela forma do número.
    const normalized = normalizeWhatsappNumber(raw);

    if (!normalized.ok) {
      return {
        error: normalized.error,
        fieldErrors: { notificationWhatsapp: normalized.error },
      };
    }

    await ensureAiAgentSettings(clientId);
    await updateAiAgentSettings(clientId, {
      notification_whatsapp: normalized.value,
    });

    refresh();
    return { success: "Número salvo." };
  } catch (error) {
    return toState(error);
  }
}

export async function testNotificationNumberAction(
  _prevState: AiAgentActionState,
  formData: FormData,
): Promise<AiAgentActionState> {
  try {
    const { clientId } = await requireCompletePlanClient();

    // Usa o número do formulário quando informado, para testar antes de salvar.
    const raw = String(formData.get("notificationWhatsapp") ?? "").trim();
    const settings = await ensureAiAgentSettings(clientId);
    const target = raw
      ? normalizeWhatsappNumber(raw)
      : settings.notificationWhatsapp
        ? ({ ok: true, value: settings.notificationWhatsapp } as const)
        : ({ ok: false, error: "Informe o número antes de testar." } as const);

    if (!target.ok) {
      return {
        error: target.error,
        fieldErrors: { notificationWhatsapp: target.error },
      };
    }

    const session = await getSessionForClient(clientId);

    if (session?.status !== "WORKING") {
      return {
        error:
          "Não foi possível enviar a mensagem. Verifique o número e a conexão do WhatsApp.",
      };
    }

    const waha = await getWahaConfig();

    await sendWahaText(waha, {
      session: session.sessionName,
      chatId: await resolveWahaChatId(waha, session.sessionName, target.value),
      text: "✅ Teste realizado com sucesso. Este número está configurado para receber novos leads qualificados.",
    });

    return { success: "Mensagem de teste enviada." };
  } catch (error) {
    if (error instanceof AiAgentError) {
      return { error: error.message };
    }

    // Mensagens do WAHA já são escritas para o usuário e não têm segredos.
    if (error instanceof WahaRequestError) {
      console.error("[ia/teste-notificacao] falha", {
        status: error.status,
        message: error.message,
      });
      return { error: `Não foi possível enviar: ${error.message}` };
    }

    console.error("[ia/teste-notificacao] falha", {
      code: "action_failed",
    });

    return {
      error:
        "Não foi possível enviar a mensagem. Verifique o número e a conexão do WhatsApp.",
    };
  }
}

// ---------------------------------------------------------------------------
// Configurações avançadas
// ---------------------------------------------------------------------------

function msField(limits: { min: number; max: number }, label: string) {
  return z.coerce
    .number()
    .int(`${label} precisa ser um número inteiro.`)
    .min(limits.min, `${label} não pode ser menor que ${limits.min / 1000}s.`)
    .max(limits.max, `${label} não pode passar de ${limits.max / 1000}s.`);
}

const advancedSchema = z
  .object({
    delayMinMs: msField(AI_AGENT_LIMITS.delayMinMs, "O delay mínimo"),
    delayMaxMs: msField(AI_AGENT_LIMITS.delayMaxMs, "O delay máximo"),
    messageGapMinMs: msField(
      AI_AGENT_LIMITS.messageGapMinMs,
      "O intervalo mínimo entre mensagens",
    ),
    messageGapMaxMs: msField(
      AI_AGENT_LIMITS.messageGapMaxMs,
      "O intervalo máximo entre mensagens",
    ),
    debounceMs: msField(
      AI_AGENT_LIMITS.debounceMs,
      "O agrupamento de mensagens",
    ),
    alwaysOn: z.boolean(),
    typingEnabled: z.boolean(),
    notifyQualified: z.boolean(),
  })
  .superRefine((data, context) => {
    if (data.delayMaxMs < data.delayMinMs) {
      context.addIssue({
        code: "custom",
        path: ["delayMaxMs"],
        message: "O delay máximo precisa ser maior ou igual ao mínimo.",
      });
    }

    if (data.messageGapMaxMs < data.messageGapMinMs) {
      context.addIssue({
        code: "custom",
        path: ["messageGapMaxMs"],
        message: "O intervalo máximo precisa ser maior ou igual ao mínimo.",
      });
    }
  });

// A tela trabalha em segundos; o banco guarda milissegundos.
function secondsToMs(value: FormDataEntryValue | null) {
  const seconds = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : Number.NaN;
}

export async function saveAiAdvancedSettingsAction(
  _prevState: AiAgentActionState,
  formData: FormData,
): Promise<AiAgentActionState> {
  try {
    const { clientId } = await requireCompletePlanClient();

    const parsed = advancedSchema.safeParse({
      delayMinMs: secondsToMs(formData.get("delayMin")),
      delayMaxMs: secondsToMs(formData.get("delayMax")),
      messageGapMinMs: secondsToMs(formData.get("messageGapMin")),
      messageGapMaxMs: secondsToMs(formData.get("messageGapMax")),
      debounceMs: secondsToMs(formData.get("debounce")),
      alwaysOn: formData.get("alwaysOn") === "on",
      typingEnabled: formData.get("typingEnabled") === "on",
      notifyQualified: formData.get("notifyQualified") === "on",
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        error: issue?.message,
        fieldErrors: issue?.path?.[0]
          ? { [String(issue.path[0])]: issue.message }
          : undefined,
      };
    }

    await ensureAiAgentSettings(clientId);
    await updateAiAgentSettings(clientId, {
      delay_min_ms: parsed.data.delayMinMs,
      delay_max_ms: parsed.data.delayMaxMs,
      message_gap_min_ms: parsed.data.messageGapMinMs,
      message_gap_max_ms: parsed.data.messageGapMaxMs,
      debounce_ms: parsed.data.debounceMs,
      always_on: parsed.data.alwaysOn,
      typing_enabled: parsed.data.typingEnabled,
      notify_qualified: parsed.data.notifyQualified,
    });

    refresh();
    return { success: "Configurações salvas." };
  } catch (error) {
    return toState(error);
  }
}

// ---------------------------------------------------------------------------
// Atendimento humano
// ---------------------------------------------------------------------------

const conversationSchema = z.object({
  conversationId: z.string().uuid("Conversa inválida."),
  humanTakeover: z.boolean(),
});

export async function setHumanTakeoverAction(
  _prevState: AiAgentActionState,
  formData: FormData,
): Promise<AiAgentActionState> {
  try {
    const { clientId, user } = await requireCompletePlanClient();

    const parsed = conversationSchema.safeParse({
      conversationId: formData.get("conversationId"),
      humanTakeover: formData.get("humanTakeover") === "true",
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message };
    }

    // A consulta já é escopada pelo cliente: id de outro tenant não resolve.
    const conversation = await findConversationById(
      clientId,
      parsed.data.conversationId,
    );

    if (!conversation) {
      return { error: "Conversa não encontrada." };
    }

    const result = await transition(clientId, "takeover", {
      conversationId: conversation.id,
      human: parsed.data.humanTakeover,
      actorId: user.id,
    });
    if (!result.ok) return { error: "Não foi possível alterar o atendimento." };
    const session = await getSessionForClient(clientId);
    if (session) {
      try {
        await setWahaTyping(await getWahaConfig(), {
          session: session.sessionName,
          chatId: conversation.chat_id,
          typing: false,
        });
      } catch {
        /* Cancellation is already persisted if WAHA is offline. */
      }
    }
    refresh();
    return {
      success: parsed.data.humanTakeover
        ? "A IA parou de responder esta conversa."
        : "IA retomada. Apenas novas mensagens receberão resposta.",
    };
  } catch (error) {
    return toState(error);
  }
}

// ---------------------------------------------------------------------------
// Detalhe da conversa (carregado sob demanda ao abrir um lead)
// ---------------------------------------------------------------------------

export type ConversationDetailResult = {
  messages?: AiConversationMessage[];
  error?: string;
};

export async function loadConversationMessagesAction(
  conversationId: string,
): Promise<ConversationDetailResult> {
  try {
    const { clientId } = await requireCompletePlanClient();
    const conversation = await findConversationById(clientId, conversationId);

    if (!conversation) {
      return { error: "Conversa não encontrada." };
    }

    return { messages: await listConversationMessages(conversation.id) };
  } catch (error) {
    const state = toState(error);
    return { error: state.error };
  }
}

export async function saveAiKnowledgeAction(
  _previous: AiAgentActionState,
  formData: FormData,
): Promise<AiAgentActionState> {
  try {
    const { clientId } = await requireCompletePlanClient();
    // O roteiro de mensagens é salvo em outro formulário: preserva o atual.
    const current = await ensureAiAgentSettings(clientId);
    const getLines = (key: string) =>
      String(formData.get(key) ?? "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    const faqLines = getLines("faq");
    if (faqLines.some((line) => !line.includes("|")))
      return { error: "Separe cada pergunta da resposta usando |." };
    const parsed = knowledgeSchema.safeParse({
      company: formData.get("company"),
      service: formData.get("service"),
      ...Object.fromEntries(
        [
          "buys",
          "doesNotBuy",
          "regions",
          "hours",
          "documents",
          "rules",
          "forbiddenPromises",
          "allowedFacts",
          "escalation",
        ].map((k) => [k, getLines(k)]),
      ),
      faq: faqLines.map((line) => ({
        question: line.slice(0, line.indexOf("|")).trim(),
        answer: line.slice(line.indexOf("|") + 1).trim(),
      })),
      script: current.knowledge.script,
    });
    if (!parsed.success)
      return {
        error:
          "Revise os campos da base: use até 30 itens, com até 500 caracteres por item.",
      };
    await updateAiAgentSettings(clientId, { knowledge: parsed.data });
    refresh();
    return { success: "Base de conhecimento salva." };
  } catch (error) {
    return toState(error);
  }
}

export async function saveAiScheduleAction(
  _previous: AiAgentActionState,
  formData: FormData,
): Promise<AiAgentActionState> {
  try {
    const { clientId } = await requireCompletePlanClient();
    const parsed = scheduleSchema.safeParse({
      weekdays: formData.getAll("weekdays").map(Number),
      start: formData.get("start"),
      end: formData.get("end"),
      timezone: formData.get("timezone"),
      offHoursMessage: formData.get("offHoursMessage"),
    });
    if (!parsed.success)
      return {
        error: "Selecione os dias, horários diferentes e um fuso válido.",
      };
    await ensureAiAgentSettings(clientId);
    await updateAiAgentSettings(clientId, {
      business_schedule: parsed.data,
      timezone: parsed.data.timezone,
    });
    refresh();
    return {
      success:
        "Horários salvos. Desative o atendimento 24 horas para usar esta agenda.",
    };
  } catch (error) {
    return toState(error);
  }
}

// ---------------------------------------------------------------------------
// Roteiro de mensagens (a IA só escolhe qual delas enviar)
// ---------------------------------------------------------------------------

export async function saveAiScriptAction(
  _previous: AiAgentActionState,
  formData: FormData,
): Promise<AiAgentActionState> {
  try {
    const { clientId } = await requireCompletePlanClient();
    const read = (key: string) => String(formData.get(key) ?? "").trim();
    const script: AiScript = {
      greeting: read("greeting"),
      acknowledge: read("acknowledge"),
      questions: Object.fromEntries(
        Object.keys(SCRIPT_QUESTIONS).map((key) => [key, read(`q_${key}`)]),
      ) as AiScript["questions"],
      replies: Object.fromEntries(
        Object.keys(SCRIPT_REPLIES).map((key) => [key, read(`r_${key}`)]),
      ) as AiScript["replies"],
    };
    const problem = checkScriptInput(script);
    if (problem) return { error: problem };
    const current = await ensureAiAgentSettings(clientId);
    await updateAiAgentSettings(clientId, {
      knowledge: { ...current.knowledge, script },
    });
    refresh();
    return { success: "Mensagens do atendimento salvas." };
  } catch (error) {
    return toState(error);
  }
}

export async function restoreAiScriptAction(): Promise<AiAgentActionState> {
  try {
    const { clientId } = await requireCompletePlanClient();
    const current = await ensureAiAgentSettings(clientId);
    await updateAiAgentSettings(clientId, {
      knowledge: { ...current.knowledge, script: DEFAULT_SCRIPT },
    });
    refresh();
    return { success: "Mensagens padrão restauradas." };
  } catch (error) {
    return toState(error);
  }
}

// ---------------------------------------------------------------------------
// Frase de ativação
// ---------------------------------------------------------------------------

export async function saveAiActivationAction(
  _previous: AiAgentActionState,
  formData: FormData,
): Promise<AiAgentActionState> {
  try {
    const { clientId } = await requireCompletePlanClient();
    const enabled = formData.get("activationEnabled") === "on";
    const phrases = readActivationPhrases(formData);
    if (!phrases.ok) return phrases.state;
    const current = await ensureAiAgentSettings(clientId);
    await updateAiAgentSettings(clientId, {
      knowledge: {
        ...current.knowledge,
        activation: { enabled, phrases: phrases.value },
      },
    });
    refresh();
    return {
      success: enabled
        ? "Frases de ativação salvas."
        : "Frases salvas. A IA vai responder qualquer número novo.",
    };
  } catch (error) {
    return toState(error);
  }
}

/** Lê as frases (um campo por frase), sem vazias e sem repetidas. */
function readActivationPhrases(
  formData: FormData,
): { ok: true; value: string[] } | { ok: false; state: AiAgentActionState } {
  const seen = new Set<string>();
  const value: string[] = [];
  for (const raw of formData.getAll("activationPhrase")) {
    const phrase = String(raw).trim();
    if (!phrase) continue;
    if (phrase.length < 3 || phrase.length > 200)
      return {
        ok: false,
        state: {
          error: "Cada frase de ativação precisa ter entre 3 e 200 caracteres.",
        },
      };
    const key = normalizeActivationText(phrase);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    value.push(phrase);
  }
  if (!value.length)
    return { ok: false, state: { error: "Cadastre pelo menos uma frase." } };
  if (value.length > MAX_ACTIVATION_PHRASES)
    return {
      ok: false,
      state: { error: `Use no máximo ${MAX_ACTIVATION_PHRASES} frases.` },
    };
  return { ok: true, value };
}

export async function restoreAiActivationAction(): Promise<AiAgentActionState> {
  try {
    const { clientId } = await requireCompletePlanClient();
    const current = await ensureAiAgentSettings(clientId);
    await updateAiAgentSettings(clientId, {
      knowledge: { ...current.knowledge, activation: DEFAULT_ACTIVATION },
    });
    refresh();
    return { success: "Frase padrão restaurada." };
  } catch (error) {
    return toState(error);
  }
}

// ---------------------------------------------------------------------------
// Números bloqueados
// ---------------------------------------------------------------------------

const blockedIdSchema = z.string().uuid("Número inválido.");

type BlockedForm =
  | { ok: true; whatsappNumber: string; label: string | null }
  | { ok: false; state: AiAgentActionState };

function readBlockedForm(formData: FormData): BlockedForm {
  const phone = normalizeBrazilianWhatsapp(
    String(formData.get("whatsappNumber") ?? ""),
  );
  const label = String(formData.get("label") ?? "").trim();
  if (!phone.ok)
    return {
      ok: false,
      state: { error: phone.error, fieldErrors: { whatsappNumber: phone.error } },
    };
  if (label.length > 80)
    return {
      ok: false,
      state: {
        error: "A identificação pode ter até 80 caracteres.",
        fieldErrors: { label: "Até 80 caracteres." },
      },
    };
  return { ok: true, whatsappNumber: phone.value, label: label || null };
}

export async function addBlockedNumberAction(
  _previous: AiAgentActionState,
  formData: FormData,
): Promise<AiAgentActionState> {
  try {
    const { clientId } = await requireCompletePlanClient();
    const parsed = readBlockedForm(formData);
    if (!parsed.ok) return parsed.state;
    await addBlockedNumber(clientId, parsed);
    refresh();
    return { success: "Número bloqueado. A IA não vai responder a ele." };
  } catch (error) {
    return toState(error);
  }
}

export async function updateBlockedNumberAction(
  _previous: AiAgentActionState,
  formData: FormData,
): Promise<AiAgentActionState> {
  try {
    const { clientId } = await requireCompletePlanClient();
    const id = blockedIdSchema.safeParse(formData.get("id"));
    if (!id.success) return { error: "Número inválido." };
    const parsed = readBlockedForm(formData);
    if (!parsed.ok) return parsed.state;
    await updateBlockedNumber(clientId, id.data, {
      whatsappNumber: parsed.whatsappNumber,
      label: parsed.label,
    });
    refresh();
    return { success: "Número atualizado." };
  } catch (error) {
    return toState(error);
  }
}

export async function toggleBlockedNumberAction(
  _previous: AiAgentActionState,
  formData: FormData,
): Promise<AiAgentActionState> {
  try {
    const { clientId } = await requireCompletePlanClient();
    const id = blockedIdSchema.safeParse(formData.get("id"));
    if (!id.success) return { error: "Número inválido." };
    const blocked = formData.get("blocked") === "true";
    await updateBlockedNumber(clientId, id.data, { blocked });
    refresh();
    return {
      success: blocked
        ? "Número bloqueado novamente."
        : "Número liberado. A IA volta a responder a ele.",
    };
  } catch (error) {
    return toState(error);
  }
}

export async function deleteBlockedNumberAction(
  _previous: AiAgentActionState,
  formData: FormData,
): Promise<AiAgentActionState> {
  try {
    const { clientId } = await requireCompletePlanClient();
    const id = blockedIdSchema.safeParse(formData.get("id"));
    if (!id.success) return { error: "Número inválido." };
    await deleteBlockedNumber(clientId, id.data);
    refresh();
    return { success: "Número removido da lista." };
  } catch (error) {
    return toState(error);
  }
}

// ---------------------------------------------------------------------------
// Quiz "Monte sua IA": perfil do lead qualificado
// ---------------------------------------------------------------------------

const splitList = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

function optionalNumber(value: FormDataEntryValue | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

export async function saveAiProfileAction(
  _previous: AiAgentActionState,
  formData: FormData,
): Promise<AiAgentActionState> {
  try {
    const { clientId } = await requireCompletePlanClient();
    const phrases = readActivationPhrases(formData);
    if (!phrases.ok) return phrases.state;

    const company = String(formData.get("company") ?? "").trim();
    if (company.length < 2 || company.length > 200)
      return { error: "Informe o nome da empresa (até 200 caracteres)." };

    const vehicleTypes = [
      ...formData.getAll("vehicleTypes").map((v) => String(v).trim()),
      ...splitList(formData.get("vehicleTypesOther")),
    ].filter(Boolean);
    if (!vehicleTypes.length)
      return { error: "Escolha pelo menos um tipo de veículo." };

    const overduePolicy = String(formData.get("overduePolicy") ?? "any");
    const minVehicleYear = optionalNumber(formData.get("minVehicleYear"));
    const currentYear = new Date().getFullYear();
    if (
      minVehicleYear !== null &&
      (minVehicleYear < 1950 || minVehicleYear > currentYear + 1)
    )
      return { error: `O ano mínimo precisa estar entre 1950 e ${currentYear + 1}.` };
    const minOverdueInstallments =
      overduePolicy === "current_only"
        ? null
        : optionalNumber(formData.get("minOverdueInstallments"));
    if (
      minOverdueInstallments !== null &&
      (minOverdueInstallments < 1 || minOverdueInstallments > 120)
    )
      return { error: "O mínimo de parcelas atrasadas precisa ser de 1 a 120." };
    // Valor em reais inteiros, digitado com máscara ("R$ 50.000").
    const maxDebtAmount = optionalNumber(formData.get("maxDebtAmount")) || null;

    const profile = profileSchema.parse({
      completedAt: new Date().toISOString(),
      vehicleTypes: [...new Set(vehicleTypes)].slice(0, 12),
      overduePolicy,
      minOverdueInstallments,
      minVehicleYear,
      manualReviewYears: Math.min(
        10,
        optionalNumber(formData.get("manualReviewYears")) ?? 0,
      ),
      maxDebtAmount,
      rejectedBanks: splitList(formData.get("rejectedBanks")).slice(0, 30),
      ask: Object.fromEntries(
        Object.keys(DEFAULT_PROFILE.ask).map((key) => [
          key,
          formData.get(`ask_${key}`) === "on",
        ]),
      ),
      notes: String(formData.get("notes") ?? "").slice(0, 1000),
    });

    const current = await ensureAiAgentSettings(clientId);
    const enableNow = formData.get("enableNow") === "on";
    if (enableNow) {
      const session = await getSessionForClient(clientId);
      if (session?.status !== "WORKING")
        return {
          error: "Conecte seu WhatsApp antes de ativar o atendimento automático.",
        };
    }

    await updateAiAgentSettings(clientId, {
      knowledge: {
        ...current.knowledge,
        company,
        profile,
        activation: { enabled: true, phrases: phrases.value },
      },
      ...(enableNow ? { enabled: true, disabled_by_plan_at: null } : {}),
    });
    refresh();
    return {
      success: enableNow
        ? "Sua IA foi criada e já está atendendo."
        : "Sua IA foi criada. Ative o atendimento quando quiser.",
    };
  } catch (error) {
    return toState(error);
  }
}

// ---------------------------------------------------------------------------
// Excluir lead
// ---------------------------------------------------------------------------

export async function deleteAiConversationAction(
  _previous: AiAgentActionState,
  formData: FormData,
): Promise<AiAgentActionState> {
  try {
    const { clientId } = await requireCompletePlanClient();
    const id = z.string().uuid().safeParse(formData.get("conversationId"));
    if (!id.success) return { error: "Lead inválido." };
    await deleteConversation(clientId, id.data);
    refresh();
    return { success: "Lead excluído com todas as mensagens." };
  } catch (error) {
    return toState(error);
  }
}
