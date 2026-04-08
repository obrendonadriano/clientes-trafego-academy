"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Brain, Database, PlugZap } from "lucide-react";
import { saveIntegrationSettingsAction, type SettingsActionState } from "@/app/admin/configuracoes/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { IntegrationSetting } from "@/lib/types";

type AdminSettingsPageProps = {
  integrations: IntegrationSetting[];
};

const initialState: SettingsActionState = {};

const geminiModels = [
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite (Recomendado)" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
] as const;

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending}>
      {pending ? "Salvando..." : "Salvar credenciais"}
    </Button>
  );
}

function IntegrationCard({ integration }: { integration: IntegrationSetting }) {
  const [state, formAction] = useActionState(saveIntegrationSettingsAction, initialState);

  const icon =
    integration.provider === "meta_ads" ? (
      <PlugZap className="size-5" />
    ) : integration.provider === "gemini" ? (
      <Brain className="size-5" />
    ) : (
      <Database className="size-5" />
    );

  return (
    <Card className="border-border/60 bg-background/60">
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/12 p-3 text-primary">{icon}</div>
            <div>
              <CardTitle className="font-display text-2xl">
                {integration.title}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {integration.description}
              </p>
            </div>
          </div>
          <Badge
            variant={
              integration.status === "connected"
                ? "success"
                : integration.status === "pending"
                  ? "secondary"
                  : "outline"
            }
          >
            {integration.status === "connected"
              ? "Conectado"
              : integration.status === "pending"
                ? "Pendente"
                : "Não configurado"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="provider" value={integration.provider} />

          {integration.provider === "meta_ads" ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="meta_app_id">App ID</Label>
                  <Input
                    id="meta_app_id"
                    name="config_app_id"
                    defaultValue={integration.config.app_id ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="meta_app_secret">App Secret</Label>
                  <Input
                    id="meta_app_secret"
                    name="config_app_secret"
                    defaultValue={integration.config.app_secret ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="meta_ad_account_id">Ad Account ID</Label>
                  <Input
                    id="meta_ad_account_id"
                    name="config_ad_account_id"
                    defaultValue={integration.config.ad_account_id ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="meta_access_token">Access Token</Label>
                  <Input
                    id="meta_access_token"
                    name="config_access_token"
                    defaultValue={integration.config.access_token ?? ""}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <a
                  href="/api/meta/connect"
                  className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                >
                  Conectar conta Meta Ads
                </a>
                <div className="inline-flex items-center rounded-full border border-border/60 px-4 py-2 text-sm text-muted-foreground">
                  Callback: /api/meta/callback
                </div>
              </div>
            </div>
          ) : null}

          {integration.provider === "gemini" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="gemini_model">Modelo</Label>
                <Select
                  id="gemini_model"
                  name="config_model"
                  defaultValue={integration.config.model ?? "gemini-2.5-flash-lite"}
                >
                  {geminiModels.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gemini_key_hint">API Key</Label>
                <Input
                  id="gemini_key_hint"
                  name="config_api_key"
                  defaultValue={integration.config.api_key ?? integration.config.api_key_hint ?? ""}
                />
              </div>
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground md:col-span-2">
                O modelo selecionado sera usado na geracao dos relatorios da pagina de IA.
              </div>
            </div>
          ) : null}

          {integration.provider === "supabase" ? (
            <div className="rounded-2xl border border-border/60 bg-card px-4 py-4 text-sm text-muted-foreground">
              <p>
                URL do projeto:{" "}
                <strong className="text-foreground">
                  {integration.config.projectUrl || "Não encontrado"}
                </strong>
              </p>
              <p className="mt-2">
                O Supabase é a base principal do sistema e é configurado por variáveis de ambiente do servidor.
              </p>
            </div>
          ) : null}

          {integration.provider !== "supabase" ? (
            <label className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={integration.enabled}
                className="mt-1 size-4 rounded border-border"
              />
              <span className="text-sm text-foreground">
                <span className="block font-medium">Ativar integração</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Quando ativada, esta conexão fica liberada para uso dentro do sistema.
                </span>
              </span>
            </label>
          ) : null}

          {integration.provider !== "supabase" ? <SaveButton /> : null}

          {state.error ? (
            <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {state.error}
            </p>
          ) : null}

          {state.success ? (
            <p className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
              {state.success}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

export function AdminSettingsPage({ integrations }: AdminSettingsPageProps) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
          Configurações
        </p>
        <h3 className="mt-2 font-display text-3xl font-semibold">
          Conexões e integrações
        </h3>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Centralize aqui as conexões do sistema, como Meta Ads, Gemini e a base principal do projeto.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {integrations.map((integration) => (
          <IntegrationCard key={integration.provider} integration={integration} />
        ))}
      </div>
    </div>
  );
}
