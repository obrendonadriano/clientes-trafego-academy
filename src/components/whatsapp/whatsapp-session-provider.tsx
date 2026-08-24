"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  isWhatsappSessionStatus,
  mapWhatsappSessionRow,
  WHATSAPP_SESSION_COLUMNS,
  type WhatsappSession,
  type WhatsappSessionRow,
  type WhatsappSessionStatus,
} from "@/lib/whatsapp-session";

type WhatsappSessionContextValue = {
  session: WhatsappSession | null;
  isLoading: boolean;
  refreshSession: () => Promise<void>;
  applyApiStatus: (status: unknown) => void;
  authenticatedFetch: (
    endpoint: string,
    init?: RequestInit,
  ) => Promise<Response>;
};

const WhatsappSessionContext = createContext<WhatsappSessionContextValue | null>(
  null,
);

export function WhatsappSessionProvider({
  children,
  enabled,
  initialSession,
}: {
  children: ReactNode;
  enabled: boolean;
  initialSession: WhatsappSession | null;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [session, setSession] = useState<WhatsappSession | null>(initialSession);
  const [isLoading, setIsLoading] = useState(
    Boolean(enabled && supabase && !initialSession),
  );

  const refreshSession = useCallback(async () => {
    if (!enabled || !supabase || document.visibilityState === "hidden") {
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("whatsapp_sessions")
      .select(WHATSAPP_SESSION_COLUMNS)
      .maybeSingle();

    if (!error) {
      setSession(
        data ? mapWhatsappSessionRow(data as WhatsappSessionRow) : null,
      );
    }
    setIsLoading(false);
  }, [enabled, supabase]);

  const applyApiStatus = useCallback((status: unknown) => {
    if (!isWhatsappSessionStatus(status)) {
      return;
    }

    setSession((current) => ({
      clientId: current?.clientId ?? "",
      status,
      phoneNumber: current?.phoneNumber ?? null,
      pushName: current?.pushName ?? null,
      connectedAt: current?.connectedAt ?? null,
      disconnectedAt: current?.disconnectedAt ?? null,
      lastError: current?.lastError ?? null,
    }));
  }, []);

  const authenticatedFetch = useCallback(
    async (endpoint: string, init: RequestInit = {}) => {
      if (!supabase) {
        throw new Error("A conexão segura com o portal não está disponível.");
      }

      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;

      if (!accessToken) {
        throw new Error("Sua sessão expirou. Saia e entre novamente no portal.");
      }

      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${accessToken}`);
      headers.set("Accept", "application/json");

      return fetch(endpoint, {
        ...init,
        headers,
        credentials: "same-origin",
      });
    },
    [supabase],
  );

  useEffect(() => {
    if (!enabled || !supabase) {
      return;
    }

    const initialRefresh = window.setTimeout(() => {
      void refreshSession();
    }, 0);

    const channel = supabase
      .channel("whatsapp-session-current-user")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_sessions" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setSession(null);
            return;
          }

          setSession(
            mapWhatsappSessionRow(payload.new as WhatsappSessionRow),
          );
        },
      )
      .subscribe();

    return () => {
      window.clearTimeout(initialRefresh);
      void supabase.removeChannel(channel);
    };
  }, [enabled, refreshSession, supabase]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const isConnecting =
      session?.status === "STARTING" || session?.status === "SCAN_QR_CODE";
    const intervalMs = isConnecting ? 3_000 : 15_000;

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshSession();
      }
    }, intervalMs);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshSession();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, refreshSession, session?.status]);

  const value = useMemo<WhatsappSessionContextValue>(
    () => ({
      session,
      isLoading,
      refreshSession,
      applyApiStatus,
      authenticatedFetch,
    }),
    [
      applyApiStatus,
      authenticatedFetch,
      isLoading,
      refreshSession,
      session,
    ],
  );

  return (
    <WhatsappSessionContext.Provider value={value}>
      {children}
    </WhatsappSessionContext.Provider>
  );
}

export function useWhatsappSession() {
  const context = useContext(WhatsappSessionContext);

  if (!context) {
    throw new Error(
      "useWhatsappSession deve ser usado dentro de WhatsappSessionProvider.",
    );
  }

  return context;
}

export type { WhatsappSessionStatus };
