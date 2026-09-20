"use client";

import { useState } from "react";
import { Download, LoaderCircle, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Botão de baixar PDF que funciona também no app instalado.
 *
 * Um `<a href>` comum navega para o PDF. No portal instalado na tela de início
 * (display: standalone) essa navegação acontece DENTRO da janela sem barra do
 * navegador: o PDF ocupa a tela inteira e o usuário fica sem compartilhar,
 * sem salvar e sem voltar.
 *
 * Aqui o arquivo é buscado por fetch e entregue de duas formas:
 *
 * - no app instalado, pela folha de compartilhamento do sistema (Salvar em
 *   Arquivos, mandar no WhatsApp para o cliente...);
 * - no resto, pelo download clássico com um link temporário.
 */

type PdfDownloadButtonProps = {
  href: string;
  fileName: string;
  label?: string;
  className?: string;
};

function isStandaloneApp() {
  if (typeof window === "undefined") {
    return false;
  }

  // `navigator.standalone` é o sinal legado do iOS, anterior ao display-mode.
  const iosStandalone = (navigator as Navigator & { standalone?: boolean })
    .standalone;

  return (
    iosStandalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

/** Usa o nome que o servidor mandou no Content-Disposition, quando houver. */
function fileNameFromResponse(response: Response, fallback: string) {
  const header = response.headers.get("content-disposition") ?? "";
  const match = header.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);

  if (!match?.[1]) {
    return fallback;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

async function messageFromFailure(response: Response) {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === "string") {
      return payload.error;
    }
  } catch {
    // resposta sem JSON: cai na mensagem genérica
  }

  if (response.status === 401) {
    return "Sua sessão expirou. Entre novamente para baixar o PDF.";
  }

  return "Não foi possível gerar o PDF. Tente novamente.";
}

function saveWithAnchor(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Revogar na hora cancela o download em alguns navegadores.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function PdfDownloadButton({
  href,
  fileName,
  label = "Baixar PDF",
  className,
}: PdfDownloadButtonProps) {
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  async function handleClick() {
    if (isWorking) {
      return;
    }

    setIsWorking(true);
    setError(null);

    try {
      const response = await fetch(href, { credentials: "same-origin" });

      if (!response.ok) {
        setError(await messageFromFailure(response));
        return;
      }

      const blob = await response.blob();
      const name = fileNameFromResponse(response, fileName);
      const file = new File([blob], name, { type: "application/pdf" });

      const canShareFile =
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      // Só no app instalado: no navegador comum o download clássico é melhor
      // (no desktop, compartilhar abriria a janela do sistema sem necessidade).
      if (isStandaloneApp() && canShareFile) {
        try {
          setSharing(true);
          await navigator.share({ files: [file], title: name });
          return;
        } catch (shareError) {
          // Usuário fechou a folha de compartilhamento: não é erro.
          if (
            shareError instanceof DOMException &&
            shareError.name === "AbortError"
          ) {
            return;
          }
          // Qualquer outra falha cai no download clássico.
        } finally {
          setSharing(false);
        }
      }

      saveWithAnchor(blob, name);
    } catch {
      setError("Não foi possível baixar o PDF. Verifique sua conexão.");
    } finally {
      setIsWorking(false);
      setSharing(false);
    }
  }

  return (
    <div className={cn("ml-auto flex flex-col items-end gap-1.5", className)}>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={isWorking}
        aria-busy={isWorking}
        className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isWorking ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : sharing ? (
          <Share2 className="size-4" />
        ) : (
          <Download className="size-4" />
        )}
        {isWorking ? "Gerando PDF..." : label}
      </button>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
