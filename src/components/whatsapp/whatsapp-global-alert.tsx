"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useWhatsappSession } from "@/components/whatsapp/whatsapp-session-provider";

export function WhatsappGlobalAlert() {
  const { session } = useWhatsappSession();

  if (session?.status !== "FAILED" && session?.status !== "STOPPED") {
    return null;
  }

  return (
    <div
      role="alert"
      className="mx-3 mt-3 flex flex-col gap-3 rounded-xl border border-red-500/50 bg-red-500/15 px-4 py-3 text-sm text-red-800 sm:flex-row sm:items-center dark:text-red-200 lg:mx-[1.05rem]"
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          <strong>WhatsApp desconectado.</strong>{" "}
          Seus leads pararam de chegar. Reconecte para voltar a receber.
        </p>
      </div>
      <Link
        href="/dashboard/conversoes"
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-red-700 px-4 font-medium text-white outline-none transition hover:bg-red-800 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
      >
        Reconectar
      </Link>
    </div>
  );
}

