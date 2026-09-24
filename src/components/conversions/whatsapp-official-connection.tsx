"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, ShieldCheck, Smartphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { WhatsappLogo } from "@/components/whatsapp/whatsapp-logo";
import {
  connectionHeadline,
  formatOfficialPhone,
  isConnected,
  trackingHeadline,
  type ClientConnection,
  type ConnectionTone,
} from "@/lib/conversions/connection-shared";
import {
  ensureFacebookSdk,
  isFacebookSdkPresent,
  type FacebookSdk,
} from "@/lib/meta/fb-sdk";
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

type SignupSessionInfo = {
  type?: string;
  // FINISH, FINISH_ONLY_WABA, FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING ou CANCEL.
  event?: string;
  data?: {
    waba_id?: string;
    phone_number_id?: string;
    current_step?: string;
    error_message?: string;
  };
};

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
  const [sdkReady, setSdkReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // O evento de sessão da Meta chega por postMessage, separado do callback do
  // login. Guardamos exatamente o que ela devolveu — nada é inferido aqui.
  const signupInfo = useRef<{
    wabaId?: string;
    phoneNumberId?: string;
    event?: string;
    cancelledAt?: string;
  }>({});

  // Numa navegação interna o script já está na página e o evento de
  // carregamento não se repete — mas `window.FB` está lá. Conferir na
  // montagem é o que libera o botão sem exigir recarregar a página.
  const prepareSdk = useCallback(() => {
    if (!appId || !configId) {
      return;
    }

    if (ensureFacebookSdk(window, { appId, version: graphVersion ?? "" })) {
      setSdkReady(true);
    }
  }, [appId, configId, graphVersion]);

  useEffect(() => {
    prepareSdk();
  }, [prepareSdk]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (
        event.origin !== "https://www.facebook.com" &&
        event.origin !== "https://web.facebook.com"
      ) {
        return;
      }

      try {
        const parsed = (
          typeof event.data === "string" ? JSON.parse(event.data) : event.data
        ) as SignupSessionInfo;

        if (parsed?.type !== "WA_EMBEDDED_SIGNUP") {
          return;
        }

        signupInfo.current.event = parsed.event;

        if (parsed.event === "CANCEL") {
          // A Meta interrompeu o fluxo (inclusive quando o número não pode ser
          // compartilhado). Guardamos onde parou para explicar sem tecnicidade.
          signupInfo.current.cancelledAt = parsed.data?.current_step;
          return;
        }

        if (parsed.data?.waba_id) {
          signupInfo.current.wabaId = parsed.data.waba_id;
        }

        if (parsed.data?.phone_number_id) {
          signupInfo.current.phoneNumberId = parsed.data.phone_number_id;
        }
      } catch {
        // Mensagem de outro fluxo da Meta: ignorar em silêncio.
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
            wabaId: signupInfo.current.wabaId,
            phoneNumberId: signupInfo.current.phoneNumberId,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          trackingReady?: boolean;
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
            : "WhatsApp conectado. Estamos finalizando a configuração do rastreamento.",
        });
        router.refresh();
      } catch {
        showToast({
          message: "Não foi possível falar com o servidor. Tente novamente.",
          tone: "erro",
        });
      } finally {
        setBusy(false);
        signupInfo.current = {};
      }
    },
    [router, showToast],
  );

  function launch() {
    if (!isFacebookSdkPresent(window) || !configId || busy) {
      return;
    }

    signupInfo.current = {};
    setNotice(null);
    window.FB.login(
      (response) => {
        const code = response.authResponse?.code;

        if (!code) {
          // Fechou a janela ou a Meta interrompeu o fluxo. Nada muda no estado
          // da conexão e o WhatsApp do cliente segue funcionando como sempre.
          const message = signupInfo.current.cancelledAt
            ? "A conexão não foi concluída na janela da Meta. Você pode tentar novamente quando quiser."
            : "Conexão cancelada.";
          showToast({ message, tone: "erro" });
          setNotice(signupInfo.current.cancelledAt ? message : null);
          return;
        }

        void finish(code);
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
          sessionInfoVersion: 3,
        },
      },
    );
  }

  const connected = isConnected(connection.status);
  const status = connectionHeadline(connection.status);
  const tracking = trackingHeadline(connection);
  const phone = formatOfficialPhone(connection.phone);
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
              id="facebook-jssdk"
              src="https://connect.facebook.net/pt_BR/sdk.js"
              strategy="lazyOnload"
              // onReady dispara no primeiro carregamento E a cada remontagem
              // do componente, ao contrário de onLoad. É o que faz o botão
              // liberar ao voltar para esta tela por navegação interna.
              onReady={prepareSdk}
              onError={() =>
                setNotice(
                  "Não foi possível carregar a conexão segura da Meta. Verifique sua internet ou bloqueadores e tente novamente.",
                )
              }
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
