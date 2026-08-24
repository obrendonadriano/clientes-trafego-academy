"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Toast próprio, sem dependência nova: o projeto não usa biblioteca de UI e
// não vale puxar uma só por isso.
export type ToastTone = "sucesso" | "erro" | "aviso";

export type ToastInput = {
  message: string;
  tone?: ToastTone;
  // Ação opcional à direita (o "Desfazer" das marcações de lead).
  action?: { label: string; onClick: () => void };
  // Duração em ms; 0 mantém aberto até fechar na mão.
  duration?: number;
};

type ToastItem = ToastInput & { id: number; tone: ToastTone };

type ToastContextValue = {
  showToast: (input: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast precisa estar dentro de <ToastProvider>.");
  }

  return context;
}

const TONE_STYLES: Record<ToastTone, string> = {
  sucesso:
    "border-emerald-500/30 bg-emerald-500/[0.12] text-emerald-700 dark:text-emerald-300",
  erro: "border-destructive/30 bg-destructive/[0.12] text-destructive",
  aviso:
    "border-amber-500/30 bg-amber-500/[0.12] text-amber-700 dark:text-amber-300",
};

function ToastIcon({ tone }: { tone: ToastTone }) {
  if (tone === "erro") {
    return <CircleAlert className="mt-0.5 size-4 shrink-0" />;
  }

  if (tone === "aviso") {
    return <Info className="mt-0.5 size-4 shrink-0" />;
  }

  return <CircleCheck className="mt-0.5 size-4 shrink-0" />;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((input: ToastInput) => {
    const id = nextId.current;
    nextId.current += 1;

    setToasts((current) => [
      ...current.slice(-2),
      { ...input, id, tone: input.tone ?? "sucesso" },
    ]);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-end lg:pb-4"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const duration = toast.duration ?? (toast.action ? 5000 : 4000);

  useEffect(() => {
    if (duration <= 0) {
      return;
    }

    const timer = window.setTimeout(() => onDismiss(toast.id), duration);
    return () => window.clearTimeout(timer);
  }, [duration, onDismiss, toast.id]);

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur",
        "animate-in fade-in slide-in-from-bottom-2",
        TONE_STYLES[toast.tone],
      )}
    >
      <ToastIcon tone={toast.tone} />

      <span className="min-w-0 flex-1 leading-6">{toast.message}</span>

      {toast.action ? (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id);
          }}
          className="shrink-0 rounded-lg px-2 py-1 font-semibold underline-offset-4 transition hover:underline"
        >
          {toast.action.label}
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Fechar aviso"
        className="shrink-0 rounded-lg p-1 opacity-60 transition hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
