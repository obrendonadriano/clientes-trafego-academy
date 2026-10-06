"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, ShieldCheck, Smartphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { WhatsappLogo } from "@/components/whatsapp/whatsapp-logo";
import {
  describeLoginOutcome,
  ensureFacebookSdk,
  waitForSessionEvent,
  type FacebookSdk,
  type SdkHost,
} from "@/lib/meta/fb-sdk";
import {
  parseSignupMessage,
  type SignupSession,
} from "@/lib/meta/onboarding-selection";
import {
  connectionHeadline,
  connectionNote,
  formatOfficialPhone,
  isConnected,
  trackingHeadline,
  type ClientConnection,
  type ConnectionTone,
} from "@/lib/conversions/connection-shared";
import { cn } from "@/lib/utils";

// Conexão oficial do WhatsApp Business por Embedded Signup (Coexistence).
//
// Tudo que o cliente vê e escolhe acontece dentro do popup hospedado pela
// Meta: login empresarial, seleção da conta e do número, e o aviso de quais
// números são elegíveis, quais estão "não qualificados" e quais não podem ser
// compartilhados com o app. Esta tela não constrói nenhum seletor próprio e
// não tenta contornar essa decisão — ela apenas abre o popup e respeita o que
// volta de lá.
//
// O cliente continua usando o mesmo número no aplicativo do celular: este fluxo
// não migra o número nem pede leitura de QR. O navegador recebe apenas um
// código de autorização de vida curta e o entrega ao servidor, que faz todo o
// resto. Nenhum segredo passa por aqui.

declare global {
  interface Window {
    FB?: FacebookSdk;
  }
}

const TONE_DOT: Record<ConnectionTone, string> = {
  ok: "bg-emerald-500",
  progress: "bg-amber-500",
  warn: "bg-red-500",
  idle: "bg-muted-foreground/40",
};

function StatusLine({
  title,
  label,
  tone,
}: {
  title: string;
  label: string;
  tone: ConnectionTone;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{title}</span>
      <span className="inline-flex items-center gap-2 text-sm font-medium">
        <span
          aria-hidden
          className={cn("size-2.5 rounded-full", TONE_DOT[tone])}
        />
        {label}
      </span>
    </div>
  );
}

export function WhatsappOfficialConnection({
  connection,
  appId,
  configId,
  graphVersion,
  unavailableReason,
}: {
  connection: ClientConnection;
  appId?: string;
  configId?: string;
  graphVersion?: string;
  unavailableReason?: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  // Navegação dentro do app: o SDK pode já estar carregado de uma visita
  // anterior, e aí o onLoad do <Script> não dispara de novo. Reconhecer isso
  // já na montagem evita a tela presa em "Preparando a conexão segura…".
  const [sdkReady, setSdkReady] = useState(
    () =>
      typeof window !== "undefined" &&
      ensureFacebookSdk(window as SdkHost, { appId, version: graphVersion }),
  );
  const [notice, setNotice] = useState<string | null>(null);
  // O evento de sessão da Meta chega por postMessage, separado do callback do
  // login. Guardamos exatamente o que ela devolveu — nada é inferido aqui.
  const signupInfo = useRef<SignupSession | null>(null);

  const markSdkReady = useCallback(() => {
    if (ensureFacebookSdk(window as SdkHost, { appId, version: graphVersion })) {
      setSdkReady(true);
    }
  }, [appId, graphVersion]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Só aceita mensagens https de *.facebook.com e do tipo WA_EMBEDDED_SIGNUP.
      const session = parseSignupMessage(event.origin, event.data);

      if (session) {
        signupInfo.current = session;
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const finish = useCallback(
    async (code: string) => {
      setBusy(true);

      try {
        const response = await fetch("/api/whatsapp/embedded-signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Só o que a Meta devolveu e o servidor precisa conferir.
          body: JSON.stringify({
            code,
            wabaId: signupInfo.current?.wabaId ?? null,
            phoneNumberId: signupInfo.current?.phoneNumberId ?? null,
            // Diz ao servidor se foi o onboarding do aplicativo WhatsApp
            // Business (Coexistence), que traz só o WABA.
            event: signupInfo.current?.event ?? null,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          trackingReady?: boolean;
          needsAttention?: boolean;
          canRetry?: boolean;
        };

        if (!response.ok) {
          const message = payload.error ?? "Não foi possível conectar.";
          showToast({ message, tone: "erro" });
          // Elegibilidade é assunto da Meta: em vez de um toast que some,
          // deixamos o recado na tela com o convite a tentar mais tarde.
          if (payload.canRetry) {
            setNotice(message);
          }
          router.refresh();
          return;
        }

        setNotice(null);

        showToast({
          message: payload.trackingReady
            ? "WhatsApp conectado. O rastreamento de conversões está ativo."
            : payload.needsAttention
              ? "WhatsApp conectado, mas falta um ajuste do nosso lado. A equipe já foi avisada."
              : "O WhatsApp foi conectado, mas o rastreamento ainda está sendo configurado.",
        });
        router.refresh();
      } catch {
        showToast({
          message: "Não foi possível falar com o servidor. Tente novamente.",
          tone: "erro",
        });
      } finally {
        setBusy(false);
        signupInfo.current = null;
      }
    },
    [router, showToast],
  );

  async function handleLogin(code: string | undefined) {
    // O código vale 30 s; esperar até 1,5 s pelo evento de sessão (que traz o
    // WABA e diz se é Coexistence) cabe com folga.
    if (code) {
      await waitForSessionEvent(() => Boolean(signupInfo.current?.event), {
        timeoutMs: 1500,
      });
    }

    const outcome = describeLoginOutcome(code, signupInfo.current);

    if (outcome.kind === "code") {
      void finish(outcome.code);
      return;
    }

    // Fechou a janela, cancelou ou a Meta interrompeu o fluxo. Nada muda no
    // estado da conexão e o WhatsApp do cliente segue funcionando como sempre.
    const message =
      outcome.kind === "error"
        ? "A Meta informou um problema na janela de conexão. Tente novamente em alguns minutos."
        : outcome.kind === "cancelled"
          ? "A conexão não foi concluída na janela da Meta. Você pode tentar novamente quando quiser."
          : "Conexão cancelada.";
    showToast({ message, tone: "erro" });
    setNotice(outcome.kind === "closed" ? null : message);
    signupInfo.current = null;
  }

  function launch() {
    if (!configId || busy || !ensureFacebookSdk(window as SdkHost, { appId, version: graphVersion })) {
      return;
    }

    signupInfo.current = null;
    setNotice(null);
    window.FB?.login(
      (response) => {
        void handleLogin(response.authResponse?.code);
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          // Faz a Meta mostrar a tela de conectar a conta já existente do
          // aplicativo WhatsApp Business, em vez de migrar o número.
          featureType: "whatsapp_business_app_onboarding",
          sessionInfoVersion: "3",
          // v2/v3 do Embedded Signup deixam de funcionar em 15/10/2026; o
          // sample oficial da Meta usa v4 junto com este featureType.
          version: "v4",
        },
      },
    );
  }

  const connected = isConnected(connection.status);
  const status = connectionHeadline(connection.status);
  const tracking = trackingHeadline(connection);
  const phone = formatOfficialPhone(connection.phone);
  const statusNote = connectionNote(connection);
  const canLaunch = Boolean(appId && configId) && sdkReady && !busy;

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex items-start gap-3">
          <WhatsappLogo className="mt-0.5 size-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-semibold">
              WhatsApp Business
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {connected
                ? "Seu WhatsApp está conectado às Conversões da Tráfego Academy."
                : "Conecte o número que já recebe os contatos dos seus anúncios."}
            </p>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
          <StatusLine
            title="WhatsApp Business"
            label={status.label}
            tone={status.tone}
          />
          {phone ? (
            <StatusLine title="Número" label={phone} tone="idle" />
          ) : null}
          <StatusLine
            title="Rastreamento de conversões"
            label={tracking.label}
            tone={tracking.tone}
          />
        </div>

        {connection.keepsBusinessApp === false ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5">
            Este número não aparece como ativo no aplicativo WhatsApp Business.
            Fale com o seu gestor antes de mudar qualquer coisa no celular.
          </p>
        ) : (
          <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <Smartphone className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Você continua atendendo normalmente pelo aplicativo WhatsApp
            Business no celular. Nada muda no seu dia a dia.
          </p>
        )}

        {statusNote && !notice ? (
          <p className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-sm leading-6 text-muted-foreground">
            {statusNote}
          </p>
        ) : null}

        {notice ? (
          <p
            role="status"
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm leading-6"
          >
            {notice}
          </p>
        ) : null}

        {unavailableReason ? (
          <p
            role="status"
            className="rounded-xl border border-border/60 px-3 py-2 text-sm text-muted-foreground"
          >
            {unavailableReason}
          </p>
        ) : (
          <>
            <Script
              src="https://connect.facebook.net/pt_BR/sdk.js"
              strategy="lazyOnload"
              // onReady roda após o carregamento E a cada montagem; onLoad fica
              // como reforço. ensureFacebookSdk só inicializa uma vez.
              onReady={markSdkReady}
              onLoad={markSdkReady}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={launch}
                disabled={!canLaunch}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : (
                  <ShieldCheck className="size-4" aria-hidden />
                )}
                {connected
                  ? "Gerenciar conexão"
                  : notice
                    ? "Tentar novamente"
                    : "Conectar WhatsApp Business"}
              </button>
              {!sdkReady && !busy ? (
                <span className="text-xs text-muted-foreground">
                  Preparando a conexão segura…
                </span>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
