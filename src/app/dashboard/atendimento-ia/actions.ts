"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOptionalCurrentUser } from "@/lib/auth/session";
import {
  DEFAULT_AI_PROMPT,
  DEFAULT_AI_PROMPT_MAX_LENGTH,
} from "@/lib/ai-agent/prompt";
import {
  AI_AGENT_LIMITS,
  normalizeBrazilianWhatsapp,
  toWahaChatId,
  type AiConversationMessage,
} from "@/lib/ai-agent/shared";
import {
  AiAgentError,
  ensureAiAgentSettings,
  findConversationById,
  getClientPlan,
  getSessionForClient,
  listConversationMessages,
  updateAiAgentSettings,
} from "@/lib/ai-agent/store";
import { getWahaConfig, sendWahaText, setWahaTyping } from "@/lib/waha";
import { transition } from "@/lib/ai-agent/transitions";
import { knowledgeSchema, scheduleSchema } from "@/lib/ai-agent/config";

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
// Prompt
// ---------------------------------------------------------------------------

const promptSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(40, "O prompt precisa de pelo menos 40 caracteres.")
    .max(
      DEFAULT_AI_PROMPT_MAX_LENGTH,
      `O prompt pode ter no máximo ${DEFAULT_AI_PROMPT_MAX_LENGTH} caracteres.`,
    ),
});

export async function saveAiPromptAction(
  _prevState: AiAgentActionState,
  formData: FormData,
): Promise<AiAgentActionState> {
  try {
    const { clientId } = await requireCompletePlanClient();
    const parsed = promptSchema.safeParse({ prompt: formData.get("prompt") });

    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message,
        fieldErrors: { prompt: parsed.error.issues[0]?.message ?? "" },
      };
    }

    await ensureAiAgentSettings(clientId);
    await updateAiAgentSettings(clientId, { prompt: parsed.data.prompt });

    refresh();
    return { success: "Prompt salvo." };
  } catch (error) {
    return toState(error);
  }
}

export async function restoreAiPromptAction(): Promise<AiAgentActionState> {
  try {
    const { clientId } = await requireCompletePlanClient();

    await ensureAiAgentSettings(clientId);
    await updateAiAgentSettings(clientId, { prompt: DEFAULT_AI_PROMPT });

    refresh();
    return { success: "Prompt padrão restaurado." };
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

    const normalized = normalizeBrazilianWhatsapp(raw);

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
      ? normalizeBrazilianWhatsapp(raw)
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
      chatId: toWahaChatId(target.value),
      text: "✅ Teste realizado com sucesso. Este número está configurado para receber novos leads qualificados.",
    });

    return { success: "Mensagem de teste enviada." };
  } catch (error) {
    if (error instanceof AiAgentError) {
      return { error: error.message };
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
    });
    if (!parsed.success)
      return {
        error:
          "Revise os campos da base: use até 30 itens, com até 500 caracteres por item.",
      };
    await ensureAiAgentSettings(clientId);
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
