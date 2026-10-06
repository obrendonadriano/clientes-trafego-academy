import "server-only";

import { graphUrl, getMetaConversionsConfig } from "@/lib/meta/conversions-config";
import * as diagnostics from "@/lib/meta/onboarding-diagnostics";
import * as selection from "@/lib/meta/onboarding-selection";
import {
  runOnboardingCore,
  type GraphCall,
  type OnboardingInput,
  type OnboardingResult,
} from "@/lib/meta/onboarding-core";

// Onboarding oficial do WhatsApp Business (Coexistence) e resolução do Dataset
// de Conversões do cliente. A lógica vive em onboarding-core.ts (testada com a
// Meta simulada); aqui ficam só a chamada HTTP real e a configuração.
//
// Nada neste arquivo roda no navegador: o código de autorização vira token aqui
// e o token nunca volta para a resposta HTTP nem para log.

const TIMEOUT_MS = 30_000;

export class MetaOnboardingError extends Error {
  readonly userMessage: string;
  readonly retryable: boolean;
  readonly adminHint: string;

  constructor(
    message: string,
    options: { userMessage: string; retryable: boolean; adminHint: string },
  ) {
    super(message);
    this.name = "MetaOnboardingError";
    this.userMessage = options.userMessage;
    this.retryable = options.retryable;
    this.adminHint = options.adminHint;
  }
}

type GraphErrorBody = {
  error?: { message?: string; code?: number; error_subcode?: number };
};

// Chamada à Graph API. O token do cliente vai SÓ no cabeçalho Authorization;
// a troca do code e o debug_token usam query string porque é assim que a Meta
// documenta esses dois endpoints (servidor a servidor, nunca logado).
const graph: GraphCall = async (stage, path, init) => {
  const url = new URL(graphUrl(path));

  for (const [key, value] of Object.entries(init.searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  const headers = new Headers({ Accept: "application/json" });

  if (init.accessToken) {
    headers.set("Authorization", `Bearer ${init.accessToken}`);
  }

  if (init.body) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method: init.method,
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new diagnostics.MetaGraphFailure(diagnostics.networkFailure(stage));
  }

  const text = await response.text();
  let payload: unknown = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const details = (payload as GraphErrorBody | null)?.error;

    throw new diagnostics.MetaGraphFailure(
      diagnostics.classifyMetaError({
        stage,
        httpStatus: response.status,
        metaCode: details?.code ?? null,
        subcode: details?.error_subcode ?? null,
        // Usada só para classificar (redirect_uri, code expirado); não é logada.
        message: details?.message ?? null,
      }),
    );
  }

  return payload as never;
};

export type { OnboardingResult };

/**
 * Executa o onboarding. Erros da Meta viram MetaOnboardingError com mensagem
 * para o cliente e dica para o administrador, e são logados no formato
 * seguro de onboarding-diagnostics. Recusas de seleção (OnboardingRejected)
 * passam adiante sem alteração.
 */
export async function runOnboarding(
  input: OnboardingInput,
): Promise<OnboardingResult> {
  const { appId, appSecret } = await getMetaConversionsConfig();

  if (!appId || !appSecret) {
    throw new MetaOnboardingError("App da Meta não configurado", {
      userMessage:
        "A integração com a Meta ainda não foi configurada pelo administrador.",
      retryable: false,
      adminHint: "META_APP_ID/META_APP_SECRET ausentes (ou App ID/Secret em Configurações).",
    });
  }

  try {
    const result = await runOnboardingCore(input, {
      graph,
      appId,
      appSecret,
      selection,
      diagnostics,
    });

    for (const warning of result.warnings) {
      console.warn(
        diagnostics.failureLogLabel(warning),
        diagnostics.failureLogPayload(warning),
      );
    }

    return result;
  } catch (error) {
    if (diagnostics.isMetaGraphFailure(error)) {
      const failure = error.failure;
      console.error(
        diagnostics.failureLogLabel(failure),
        diagnostics.failureLogPayload(failure),
      );

      throw new MetaOnboardingError(error.message, {
        userMessage: diagnostics.failureUserMessage(failure),
        retryable: failure.retryable,
        adminHint: diagnostics.failureAdminHint(failure),
      });
    }

    throw error;
  }
}
