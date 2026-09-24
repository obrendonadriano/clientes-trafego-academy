"use server";

import { getOptionalCurrentUser } from "@/lib/auth/session";
import {
  createReviewTemplate,
  listReviewTemplates,
  ReviewToolError,
  sendReviewTemplateMessage,
} from "@/lib/meta/review-tools";
import {
  ReviewInputError,
  type ReviewTemplate,
} from "@/lib/meta/review-validation";

// Ações da ferramenta temporária de App Review.
//
// Cada ação revalida o papel de administrador no servidor: a proteção da
// página é conveniência de navegação, não barreira de segurança. Server
// Actions são endpoints HTTP e podem ser chamadas diretamente.

export type ReviewActionState<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: number | null };

async function requireAdmin() {
  const user = await getOptionalCurrentUser();

  if (!user || user.role !== "admin" || !user.active) {
    return null;
  }

  return user;
}

const DENIED = "Apenas um administrador logado pode usar esta ferramenta.";

// Estas chamadas fazem ações REAIS na API da Meta. Um duplo clique ou um
// refresh apressado não pode virar dois envios/dois templates.
const MIN_INTERVAL_MS = 3_000;
const lastRun = new Map<string, number>();

function rateLimited(key: string) {
  const now = Date.now();
  const previous = lastRun.get(key) ?? 0;

  if (now - previous < MIN_INTERVAL_MS) {
    return true;
  }

  lastRun.set(key, now);
  return false;
}

function toState<T>(error: unknown): ReviewActionState<T> {
  if (error instanceof ReviewInputError) {
    return { ok: false, error: error.message };
  }

  if (error instanceof ReviewToolError) {
    return { ok: false, error: error.message, code: error.code };
  }

  // Erro inesperado nunca vira stack trace na tela: ela poderia carregar
  // pedaço de requisição junto.
  return {
    ok: false,
    error: "Não foi possível concluir a operação. Tente novamente.",
  };
}

export type SendMessageResult = {
  messageId: string | null;
  waId: string | null;
  phoneNumberId: string;
};

export async function sendTestMessageAction(input: {
  to: string;
  templateName: string;
  language: string;
}): Promise<ReviewActionState<SendMessageResult>> {
  const user = await requireAdmin();

  if (!user) {
    return { ok: false, error: DENIED };
  }

  if (rateLimited(`send:${user.id}`)) {
    return {
      ok: false,
      error: "Aguarde alguns segundos antes de enviar novamente.",
    };
  }

  try {
    return { ok: true, data: await sendReviewTemplateMessage(input) };
  } catch (error) {
    return toState(error);
  }
}

export type CreateTemplateResult = {
  id: string | null;
  status: string | null;
  category: string | null;
};

export async function createTestTemplateAction(input: {
  name: string;
  language: string;
  category: string;
  body: string;
}): Promise<ReviewActionState<CreateTemplateResult>> {
  const user = await requireAdmin();

  if (!user) {
    return { ok: false, error: DENIED };
  }

  if (rateLimited(`template:${user.id}`)) {
    return {
      ok: false,
      error: "Aguarde alguns segundos antes de criar outro modelo.",
    };
  }

  try {
    return { ok: true, data: await createReviewTemplate(input) };
  } catch (error) {
    return toState(error);
  }
}

export async function listTemplatesAction(): Promise<
  ReviewActionState<ReviewTemplate[]>
> {
  const user = await requireAdmin();

  if (!user) {
    return { ok: false, error: DENIED };
  }

  try {
    return { ok: true, data: await listReviewTemplates() };
  } catch (error) {
    return toState(error);
  }
}
