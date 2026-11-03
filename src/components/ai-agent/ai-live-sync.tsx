"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, WifiOff } from "lucide-react";
import type { AiLiveStateResponse } from "@/app/api/ia/estado/route";
import type { AiAccessState } from "@/lib/ai-agent/shared";
import { Button } from "@/components/ui/button";

// Com acesso: acompanha leads novos. Sem acesso/erro: só confere se o admin
// mudou a liberação (ou se a conexão voltou), sem pesar no servidor.
const ALLOWED_INTERVAL_MS = 15_000;
const IDLE_INTERVAL_MS = 60_000;
// Ao voltar para a aba, confere na hora (se a última checagem for antiga).
const FOCUS_MIN_GAP_MS = 5_000;
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Mantém a tela da IA em dia sem recarregar às cegas.
 *
 * Consulta /api/ia/estado (acesso + impressão digital dos dados) e só pede
 * os dados novos ao servidor quando algo mudou: liberação do admin, troca de
 * plano, lead novo, IA ligada/desligada, WhatsApp caiu. Falha na consulta
 * mantém o que já está na tela — nunca troca a página por um bloqueio.
 */
export function AiLiveSync({
  access,
  fingerprint,
}: {
  access: AiAccessState;
  fingerprint: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const rendered = useRef({ access, fingerprint });
  const inFlight = useRef(false);
  const lastCheck = useRef(Date.now());

  useEffect(() => {
    rendered.current = { access, fingerprint };
  }, [access, fingerprint]);

  useEffect(() => {
    if (access === "not_configured") return;
    let disposed = false;

    async function check() {
      // Uma consulta por vez: resposta antiga nunca sobrescreve uma nova.
      if (inFlight.current || document.visibilityState !== "visible") return;
      inFlight.current = true;
      lastCheck.current = Date.now();
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch("/api/ia/estado", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (disposed) return;
        // Sessão expirou: o servidor leva para o login na renderização.
        if (response.status === 401) {
          startTransition(() => router.refresh());
          return;
        }
        if (!response.ok) throw new Error("estado indisponível");

        const next = (await response.json()) as AiLiveStateResponse;
        if (disposed) return;
        setFailed(false);

        const current = rendered.current;
        const changed =
          next.access !== current.access ||
          (next.access === "allowed" && next.fingerprint !== current.fingerprint);
        if (changed) startTransition(() => router.refresh());
      } catch {
        if (!disposed) setFailed(true);
      } finally {
        window.clearTimeout(timer);
        inFlight.current = false;
      }
    }

    const interval = window.setInterval(
      () => void check(),
      access === "allowed" ? ALLOWED_INTERVAL_MS : IDLE_INTERVAL_MS,
    );
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastCheck.current > FOCUS_MIN_GAP_MS
      ) {
        void check();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [access, router]);

  if (!failed || access !== "allowed") return null;

  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] px-4 py-2 text-xs text-amber-700"
    >
      <WifiOff className="size-3.5 shrink-0" />
      Sem conexão para atualizar os leads agora. Os dados abaixo podem estar
      desatualizados — tentando de novo automaticamente.
    </p>
  );
}

/** Falha ao consultar: explica que é conexão (não plano) e oferece tentar. */
export function AiAccessErrorNotice() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-start gap-2">
        <WifiOff className="mt-0.5 size-4 shrink-0" />
        <span>
          Não conseguimos carregar o Atendimento IA agora. Isso é uma falha de
          conexão, não um bloqueio da sua conta — suas configurações continuam
          salvas.
        </span>
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        <RefreshCw className={pending ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} />
        {pending ? "Verificando..." : "Tentar novamente"}
      </Button>
    </div>
  );
}
