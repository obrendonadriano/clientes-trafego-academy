"use client";

import Image from "next/image";
import {
  AlertCircle,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleEllipsis,
  Link2,
  LoaderCircle,
  MessageCircle,
  MonitorSmartphone,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Unplug,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { ConversionsPage } from "@/components/conversions/conversions-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useWhatsappSession } from "@/components/whatsapp/whatsapp-session-provider";
import {
  formatWhatsappPhone,
  type WhatsappSessionStatus,
} from "@/lib/whatsapp-session";
import type {
  ConversionLeadsResult,
  PeriodOption,
  QualificationTab,
} from "@/lib/conversions/shared";

const QR_RENEW_MS = 20_000;
const CONNECTION_TIMEOUT_MS = 5 * 60_000;

type WhatsappConversionsExperienceProps = {
  data: ConversionLeadsResult;
  tab: QualificationTab;
  period: PeriodOption;
};

type ApiPayload = {
  status?: unknown;
  qr?: unknown;
  error?: unknown;
  message?: unknown;
};

async function readPayload(response: Response): Promise<ApiPayload> {
  try {
    return (await response.json()) as ApiPayload;
  } catch {
    return {};
  }
}

function responseError(response: Response, payload: ApiPayload) {
  if (typeof payload.message === "string") {
    return payload.message;
  }
  if (typeof payload.error === "string") {
    return payload.error;
  }
  return `Não foi possível continuar (erro ${response.status}).`;
}

export function WhatsappConversionsExperience(
  props: WhatsappConversionsExperienceProps,
) {
  const {
    session,
    isLoading,
    authenticatedFetch,
    applyApiStatus,
    refreshSession,
  } = useWhatsappSession();
  const [attemptStartedAt, setAttemptStartedAt] = useState<number | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const status = session?.status ?? "NAO_CRIADA";
  const wasPreviouslyConnected = Boolean(
    session?.connectedAt || session?.phoneNumber,
  );

  const startConnection = useCallback(async () => {
    setRequestError(null);
    setAttemptStartedAt(Date.now());

    if (status === "STARTING" || status === "SCAN_QR_CODE") {
      await refreshSession();
      return;
    }

    if (
      status !== "NAO_CRIADA" &&
      status !== "STOPPED" &&
      status !== "FAILED"
    ) {
      return;
    }

    setIsRequesting(true);
    try {
      const response = await authenticatedFetch("/whatsapp/conectar", {
        method: "POST",
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        throw new Error(responseError(response, payload));
      }
      applyApiStatus(payload.status ?? "STARTING");
      await refreshSession();
    } catch (error) {
      setAttemptStartedAt(null);
      setRequestError(
        error instanceof Error
          ? error.message
          : "Não foi possível preparar a conexão.",
      );
    } finally {
      setIsRequesting(false);
    }
  }, [
    applyApiStatus,
    authenticatedFetch,
    refreshSession,
    status,
  ]);

  const disconnect = useCallback(async () => {
    setIsRequesting(true);
    setRequestError(null);
    try {
      const response = await authenticatedFetch("/whatsapp/desconectar", {
        method: "POST",
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        throw new Error(responseError(response, payload));
      }
      applyApiStatus(payload.status ?? "STOPPED");
      setDisconnectOpen(false);
      await refreshSession();
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : "Não foi possível desconectar agora.",
      );
    } finally {
      setIsRequesting(false);
    }
  }, [applyApiStatus, authenticatedFetch, refreshSession]);

  const checkConnectionStatus = useCallback(async () => {
    if (document.visibilityState === "hidden") {
      return;
    }

    try {
      const response = await authenticatedFetch("/whatsapp/qr?status=1");
      const payload = await readPayload(response);
      if (!response.ok) {
        throw new Error(responseError(response, payload));
      }
      applyApiStatus(payload.status);
      await refreshSession();
      setRequestError(null);
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : "Não foi possível consultar o andamento da conexão.",
      );
    }
  }, [applyApiStatus, authenticatedFetch, refreshSession]);

  const restartConnection = useCallback(async () => {
    setRequestError(null);
    setIsRequesting(true);
    try {
      if (status === "STARTING" || status === "SCAN_QR_CODE") {
        const stopResponse = await authenticatedFetch(
          "/whatsapp/desconectar",
          { method: "POST" },
        );
        const stopPayload = await readPayload(stopResponse);
        if (!stopResponse.ok) {
          throw new Error(responseError(stopResponse, stopPayload));
        }
        applyApiStatus(stopPayload.status ?? "STOPPED");
      }

      const connectResponse = await authenticatedFetch("/whatsapp/conectar", {
        method: "POST",
      });
      const connectPayload = await readPayload(connectResponse);
      if (!connectResponse.ok) {
        throw new Error(responseError(connectResponse, connectPayload));
      }
      setAttemptStartedAt(Date.now());
      applyApiStatus(connectPayload.status ?? "STARTING");
      await refreshSession();
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : "Não foi possível reiniciar a conexão.",
      );
    } finally {
      setIsRequesting(false);
    }
  }, [applyApiStatus, authenticatedFetch, refreshSession, status]);

  useEffect(() => {
    if (
      (status === "STARTING" || status === "SCAN_QR_CODE") &&
      attemptStartedAt === null
    ) {
      const timer = window.setTimeout(() => setAttemptStartedAt(Date.now()), 0);
      return () => window.clearTimeout(timer);
    }
  }, [attemptStartedAt, status]);

  useEffect(() => {
    if (status !== "WORKING" || attemptStartedAt === null) {
      return;
    }

    const timer = window.setTimeout(() => {
      setAttemptStartedAt(null);
    }, 3_000);

    return () => window.clearTimeout(timer);
  }, [attemptStartedAt, status]);

  if (isLoading) {
    return <ConnectionLoading />;
  }

  if (status === "WORKING" && attemptStartedAt !== null) {
    return <ConnectionSuccess phone={session?.phoneNumber ?? null} />;
  }

  if (status === "STARTING") {
    return (
      <PreparingConnection
        error={requestError}
        startedAt={attemptStartedAt}
        onCheckStatus={checkConnectionStatus}
        onRestart={restartConnection}
        isRequesting={isRequesting}
      />
    );
  }

  if (status === "SCAN_QR_CODE") {
    if (attemptStartedAt === null) {
      return <ConnectionLoading />;
    }

    return (
      <QrConnection
        authenticatedFetch={authenticatedFetch}
        applyApiStatus={applyApiStatus}
        refreshSession={refreshSession}
        startedAt={attemptStartedAt}
        onRestart={restartConnection}
        isRestarting={isRequesting}
      />
    );
  }

  if (
    status === "NAO_CRIADA" ||
    ((status === "STOPPED" || status === "FAILED") &&
      !wasPreviouslyConnected)
  ) {
    return (
      <ConnectionOnboarding
        status={status}
        error={requestError ?? session?.lastError ?? null}
        onConnect={startConnection}
        isRequesting={isRequesting}
      />
    );
  }

  return (
    <div className="space-y-5">
      <ConnectionStatusBar
        status={status}
        phone={session?.phoneNumber ?? null}
        onConnect={startConnection}
        onDisconnect={() => setDisconnectOpen(true)}
        isRequesting={isRequesting}
      />

      {requestError ? <InlineError message={requestError} /> : null}

      <ConversionsPage
        {...props}
        isAdmin={false}
        clients={[]}
        selectedClientId={null}
      />

      <DisconnectDialog
        open={disconnectOpen}
        isRequesting={isRequesting}
        onCancel={() => setDisconnectOpen(false)}
        onConfirm={disconnect}
      />
    </div>
  );
}

function ConnectionLoading() {
  return (
    <Card aria-busy="true">
      <CardContent className="flex min-h-[24rem] items-center justify-center">
        <span className="flex items-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
          Verificando sua conexão com o WhatsApp…
        </span>
      </CardContent>
    </Card>
  );
}

function ConnectionOnboarding({
  status,
  error,
  onConnect,
  isRequesting,
}: {
  status: WhatsappSessionStatus;
  error: string | null;
  onConnect: () => Promise<void>;
  isRequesting: boolean;
}) {
  const isRetry = status === "FAILED" || status === "STOPPED";

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="grid min-h-[32rem] lg:grid-cols-[1.15fr_0.85fr]">
          <div className="flex flex-col justify-center p-6 sm:p-9 lg:p-12">
            <span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
              <MessageCircle className="size-7" aria-hidden="true" />
            </span>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Seus leads, em um só lugar
            </p>
            <h2 className="mt-2 max-w-2xl font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Conecte seu WhatsApp para ver seus leads aqui
            </h2>
            <div className="mt-5 max-w-2xl space-y-3 text-[0.95rem] leading-7 text-muted-foreground">
              <p>
                Quando alguém clica no seu anúncio e manda mensagem no WhatsApp,
                essa pessoa aparece automaticamente nesta tela.
              </p>
              <p>
                Aí você marca quais foram bons clientes de verdade — e o Facebook
                aprende a buscar mais pessoas parecidas. Na prática: menos curioso,
                mais gente querendo fechar.
              </p>
              <p>
                A conexão é igual à do WhatsApp Web, aquela que você usa no
                computador. Leva menos de um minuto.
              </p>
            </div>

            {error ? <div className="mt-5"><InlineError message={error} /></div> : null}

            <Button
              size="lg"
              className="mt-7 w-full gap-2 sm:w-fit sm:min-w-64"
              disabled={isRequesting}
              onClick={() => void onConnect()}
            >
              {isRequesting ? (
                <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
              ) : (
                <MessageCircle className="size-5" aria-hidden="true" />
              )}
              {isRetry ? "Tentar conectar novamente" : "Conectar meu WhatsApp"}
            </Button>

            <details className="group mt-6 max-w-2xl rounded-2xl border border-border/70 bg-background/40 px-4 py-3 dark:border-white/10">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                O que vocês conseguem ver?
                <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Usamos essa conexão para identificar quem chegou até você através
                dos anúncios. Registramos apenas o nome, o telefone e qual anúncio
                a pessoa clicou. Você pode desconectar quando quiser, direto pelo
                seu celular, em Aparelhos Conectados.
              </p>
            </details>
          </div>

          <div className="flex flex-col justify-center gap-4 border-t border-border/60 bg-primary/[0.055] p-6 dark:border-white/10 lg:border-l lg:border-t-0 lg:p-10">
            <OnboardingBenefit
              icon={MonitorSmartphone}
              title="É como o WhatsApp Web"
              text="Você escaneia um código com o celular e pronto."
            />
            <OnboardingBenefit
              icon={ShieldCheck}
              title="Você mantém o controle"
              text="Pode desconectar quando quiser pelo portal ou pelo celular."
            />
            <OnboardingBenefit
              icon={CheckCircle2}
              title="Os leads chegam sozinhos"
              text="Depois da conexão, não é preciso copiar nomes ou telefones."
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OnboardingBenefit({
  icon: Icon,
  title,
  text,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-3 rounded-2xl border border-border/60 bg-background/75 p-4 dark:border-white/10">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" aria-hidden={true} />
      </span>
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

function PreparingConnection({
  error,
  startedAt,
  onCheckStatus,
  onRestart,
  isRequesting,
}: {
  error: string | null;
  startedAt: number | null;
  onCheckStatus: () => Promise<void>;
  onRestart: () => Promise<void>;
  isRequesting: boolean;
}) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (startedAt === null) {
      return;
    }
    const remaining = Math.max(0, CONNECTION_TIMEOUT_MS - (Date.now() - startedAt));
    const timer = window.setTimeout(() => setTimedOut(true), remaining);
    return () => window.clearTimeout(timer);
  }, [startedAt]);

  useEffect(() => {
    let checking = false;

    const check = async () => {
      if (checking || document.visibilityState === "hidden") {
        return;
      }
      checking = true;
      try {
        await onCheckStatus();
      } finally {
        checking = false;
      }
    };

    const firstCheck = window.setTimeout(() => void check(), 750);
    const interval = window.setInterval(() => void check(), 3_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void check();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearTimeout(firstCheck);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [onCheckStatus]);

  return (
    <Card>
      <CardContent className="flex min-h-[30rem] flex-col items-center justify-center px-6 text-center">
        {timedOut ? (
          <>
            <span className="flex size-16 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300">
              <RefreshCw className="size-7" aria-hidden="true" />
            </span>
            <h2 className="mt-5 font-display text-3xl font-semibold text-foreground">
              Vamos tentar de novo?
            </h2>
            <p className="mt-3 max-w-lg leading-7 text-muted-foreground">
              A conexão demorou mais que o normal. Vamos reiniciar com um código
              novo — você não perde nenhum lead que já estava salvo.
            </p>
            <Button
              className="mt-6 gap-2"
              disabled={isRequesting}
              onClick={() => void onRestart()}
            >
              {isRequesting ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Tentar novamente
            </Button>
          </>
        ) : (
          <>
            <span className="relative flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MessageCircle className="size-9" aria-hidden="true" />
              <LoaderCircle className="absolute -right-1 -top-1 size-6 animate-spin" aria-hidden="true" />
            </span>
            <h2 className="mt-6 font-display text-3xl font-semibold text-foreground">
              Preparando sua conexão…
            </h2>
            <p className="mt-3 max-w-lg leading-7 text-muted-foreground">
              Isso costuma levar de 5 a 20 segundos. Pode deixar esta tela aberta;
              o código vai aparecer sozinho.
            </p>
            <div className="mt-6 h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted">
              <span className="block h-full w-2/5 animate-pulse rounded-full bg-primary" />
            </div>
          </>
        )}
        {error ? <div className="mt-5 w-full max-w-xl"><InlineError message={error} /></div> : null}
      </CardContent>
    </Card>
  );
}

function QrConnection({
  authenticatedFetch,
  applyApiStatus,
  refreshSession,
  startedAt,
  onRestart,
  isRestarting,
}: {
  authenticatedFetch: (endpoint: string, init?: RequestInit) => Promise<Response>;
  applyApiStatus: (status: unknown) => void;
  refreshSession: () => Promise<void>;
  startedAt: number;
  onRestart: () => Promise<void>;
  isRestarting: boolean;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [nextRefreshAt, setNextRefreshAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const nextRefreshAtRef = useRef(0);

  const loadQr = useCallback(async () => {
    if (inFlight.current || document.visibilityState === "hidden") {
      return;
    }

    inFlight.current = true;
    setError(null);
    try {
      const response = await authenticatedFetch("/whatsapp/qr");
      const payload = await readPayload(response);
      if (!response.ok) {
        throw new Error(responseError(response, payload));
      }
      applyApiStatus(payload.status);

      if (payload.status === "WORKING") {
        await refreshSession();
        return;
      }

      if (typeof payload.qr !== "string" || !payload.qr.startsWith("data:image/")) {
        throw new Error("O código ainda não ficou pronto. Vamos tentar novamente.");
      }

      // Só troca o src depois que a imagem nova terminou de carregar.
      await new Promise<void>((resolve, reject) => {
        const preloader = new window.Image();
        preloader.onload = () => resolve();
        preloader.onerror = () => reject(new Error("O novo código não carregou."));
        preloader.src = payload.qr as string;
      });

      if (mounted.current) {
        setQr(payload.qr);
        const renewAt = Date.now() + QR_RENEW_MS;
        setNow(Date.now());
        setNextRefreshAt(renewAt);
        nextRefreshAtRef.current = renewAt;
      }
    } catch (loadError) {
      if (mounted.current) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível buscar o código agora.",
        );
        const retryAt = Date.now() + 3_000;
        setNextRefreshAt(retryAt);
        nextRefreshAtRef.current = retryAt;
      }
    } finally {
      inFlight.current = false;
    }
  }, [applyApiStatus, authenticatedFetch, refreshSession]);

  useEffect(() => {
    mounted.current = true;
    const initialLoad = window.setTimeout(() => {
      void loadQr();
    }, 0);

    const tick = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current - startedAt >= CONNECTION_TIMEOUT_MS) {
        setTimedOut(true);
        return;
      }
      if (
        document.visibilityState === "visible" &&
        current >= nextRefreshAtRef.current
      ) {
        void loadQr();
      }
    }, 250);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        void loadQr();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mounted.current = false;
      window.clearTimeout(initialLoad);
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loadQr, startedAt]);

  const remaining = Math.max(0, nextRefreshAt - now);
  const progress = remaining / QR_RENEW_MS;
  const circumference = 2 * Math.PI * 154;

  if (timedOut) {
    return (
      <Card>
        <CardContent className="flex min-h-[30rem] flex-col items-center justify-center px-6 text-center">
          <RefreshCw className="size-12 text-amber-600 dark:text-amber-300" aria-hidden="true" />
          <h2 className="mt-5 font-display text-3xl font-semibold text-foreground">Vamos tentar de novo?</h2>
          <p className="mt-3 max-w-lg leading-7 text-muted-foreground">
            O código ficou aberto por cinco minutos sem conexão. Vamos reiniciar
            o processo com um código novinho.
          </p>
          <Button className="mt-6 gap-2" disabled={isRestarting} onClick={() => void onRestart()}>
            {isRestarting ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  const steps: Array<{ icon: ComponentType<{ className?: string }>; text: ReactNode }> = [
    { icon: Smartphone, text: "Pegue o celular onde você usa o WhatsApp do escritório" },
    { icon: MessageCircle, text: "Abra o WhatsApp" },
    { icon: CircleEllipsis, text: <>Toque nos <strong>três pontinhos</strong> no alto (Android) ou em <strong>Ajustes</strong> embaixo (iPhone)</> },
    { icon: Link2, text: <>Toque em <strong>Aparelhos conectados</strong></> },
    { icon: Camera, text: <>Toque em <strong>Conectar um aparelho</strong></> },
    { icon: ScanLine, text: "Aponte a câmera do celular para o código ao lado" },
  ];

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="grid lg:grid-cols-[1fr_0.9fr]">
          <section className="p-6 sm:p-8 lg:p-10" aria-labelledby="qr-instructions-title">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Último passo</p>
            <h2 id="qr-instructions-title" className="mt-2 font-display text-3xl font-semibold text-foreground">
              Escaneie o código com o WhatsApp
            </h2>
            <ol className="mt-7 space-y-3">
              {steps.map(({ icon: Icon, text }, index) => (
                <li key={index} className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </span>
                  <p className="pt-1.5 text-sm leading-6 text-muted-foreground">
                    <span className="mr-1 font-semibold text-foreground">{index + 1}.</span>{text}
                  </p>
                </li>
              ))}
            </ol>

            <div className="mt-6 flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-800 dark:text-amber-200 lg:hidden">
              <MonitorSmartphone className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <p>
                Se você abriu este painel no celular, vai precisar de um segundo aparelho para escanear. Se puder, abra o painel no computador.
              </p>
            </div>
          </section>

          <section className="flex flex-col items-center justify-center border-t border-border/60 bg-primary/[0.045] p-5 sm:p-8 dark:border-white/10 lg:border-l lg:border-t-0" aria-label="Código QR do WhatsApp">
            <div className="relative aspect-square w-full max-w-[20rem] p-5">
              <svg className="absolute inset-0 size-full -rotate-90" viewBox="0 0 320 320" aria-hidden="true">
                <circle cx="160" cy="160" r="154" fill="none" stroke="currentColor" strokeWidth="5" className="text-border" />
                <circle
                  cx="160"
                  cy="160"
                  r="154"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - progress)}
                  className="text-primary transition-[stroke-dashoffset] duration-300"
                />
              </svg>
              <div className="relative size-full overflow-hidden rounded-2xl bg-white p-2 shadow-sm">
                {qr ? (
                  <Image
                    src={qr}
                    alt="Código QR para conectar o WhatsApp do escritório"
                    width={280}
                    height={280}
                    unoptimized
                    className="size-full object-contain"
                  />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-3 text-slate-600" aria-live="polite">
                    <LoaderCircle className="size-7 animate-spin" aria-hidden="true" />
                    <span className="text-sm">Carregando o código…</span>
                  </div>
                )}
              </div>
            </div>

            <p className="mt-4 max-w-md text-center text-sm leading-6 text-muted-foreground">
              O código se renova sozinho a cada 20 segundos por segurança. Não precisa fazer nada — só apontar a câmera.
            </p>
            <p className="mt-2 text-xs font-medium text-primary" aria-live="polite">
              Novo código em {Math.max(0, Math.ceil(remaining / 1_000))}s
            </p>

            {error ? <div className="mt-4 w-full"><InlineError message={error} /></div> : null}

            <button
              type="button"
              onClick={() => void loadQr()}
              className="mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-foreground outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Não consigo escanear — gerar novo código
            </button>
          </section>
        </div>
      </CardContent>
    </Card>
  );
}

function ConnectionSuccess({ phone }: { phone: string | null }) {
  const formattedPhone = formatWhatsappPhone(phone);

  return (
    <Card>
      <CardContent className="flex min-h-[30rem] flex-col items-center justify-center px-6 text-center">
        <span className="flex size-20 animate-[pulse_700ms_ease-out_1] items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
          <Check className="size-10" strokeWidth={3} aria-hidden="true" />
        </span>
        <h2 className="mt-6 font-display text-3xl font-semibold text-foreground sm:text-4xl">
          Pronto! Seu WhatsApp está conectado.
        </h2>
        {formattedPhone ? (
          <p className="mt-3 font-medium text-foreground">Conectado como {formattedPhone}</p>
        ) : null}
        <p className="mt-4 max-w-xl leading-7 text-muted-foreground">
          A partir de agora, todo mundo que te chamar pelos anúncios vai aparecer aqui embaixo. Pode levar alguns minutos até o primeiro aparecer.
        </p>
        <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Abrindo sua lista de leads…
        </p>
      </CardContent>
    </Card>
  );
}

function ConnectionStatusBar({
  status,
  phone,
  onConnect,
  onDisconnect,
  isRequesting,
}: {
  status: WhatsappSessionStatus;
  phone: string | null;
  onConnect: () => Promise<void>;
  onDisconnect: () => void;
  isRequesting: boolean;
}) {
  const connected = status === "WORKING";
  const connecting = status === "STARTING" || status === "SCAN_QR_CODE";
  const formattedPhone = formatWhatsappPhone(phone);

  return (
    <div
      role="status"
      className={connected
        ? "flex flex-col gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 sm:flex-row sm:items-center dark:text-emerald-200"
        : connecting
          ? "flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center dark:text-amber-200"
          : "flex flex-col gap-3 rounded-2xl border border-red-500/50 bg-red-500/15 px-4 py-3 text-sm text-red-800 sm:flex-row sm:items-center dark:text-red-200"}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className={connected ? "size-2.5 rounded-full bg-emerald-500" : connecting ? "size-2.5 animate-pulse rounded-full bg-amber-500" : "size-2.5 rounded-full bg-red-500"} />
        <strong>{connected ? "WhatsApp conectado" : connecting ? "Conectando…" : "WhatsApp desconectado"}</strong>
        {connected && formattedPhone ? <span className="text-current/75">— {formattedPhone}</span> : null}
        {!connected && !connecting ? <span className="hidden text-current/75 md:inline">— Seus leads pararam de chegar. Reconecte para voltar a receber.</span> : null}
      </span>
      {connected ? (
        <button type="button" onClick={onDisconnect} className="inline-flex h-9 items-center justify-center gap-2 rounded-full px-3 font-medium outline-none transition hover:bg-emerald-500/15 focus-visible:ring-2 focus-visible:ring-emerald-500">
          <Unplug className="size-4" aria-hidden="true" /> Desconectar
        </button>
      ) : (
        <button type="button" disabled={isRequesting} onClick={() => void onConnect()} className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-red-700 px-4 font-medium text-white outline-none transition hover:bg-red-800 focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-60">
          {isRequesting ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Reconectar
        </button>
      )}
    </div>
  );
}

function DisconnectDialog({
  open,
  isRequesting,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  isRequesting: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      dialogRef.current
        ?.querySelector<HTMLButtonElement>("[data-cancel]")
        ?.focus();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="disconnect-title" className="w-full max-w-md rounded-3xl border border-border bg-background p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-red-500/12 text-red-600 dark:text-red-300">
            <Unplug className="size-5" aria-hidden="true" />
          </span>
          <button type="button" onClick={onCancel} aria-label="Fechar" className="rounded-lg p-2 text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
            <X className="size-5" />
          </button>
        </div>
        <h2 id="disconnect-title" className="mt-5 font-display text-2xl font-semibold text-foreground">Desconectar o WhatsApp?</h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          Você vai parar de receber novos leads nesta tela. Os leads que já chegaram continuam salvos. Você pode reconectar quando quiser.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button data-cancel variant="outline" onClick={onCancel}>Manter conectado</Button>
          <Button className="bg-red-700 hover:bg-red-800" disabled={isRequesting} onClick={() => void onConfirm()}>
            {isRequesting ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
            Sim, desconectar
          </Button>
        </div>
      </div>
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-2xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-700 dark:text-red-200">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}
