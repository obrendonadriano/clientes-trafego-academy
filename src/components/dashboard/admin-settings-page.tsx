"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Brain, Database, MessageCircle, PlugZap } from "lucide-react";
import { saveIntegrationSettingsAction, type SettingsActionState } from "@/app/admin/configuracoes/actions";
import { MetaAccountsManager } from "@/components/admin/meta-accounts-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { IntegrationSetting, MetaAdAccount } from "@/lib/types";

export type SettingsView = "integracoes" | "contas";

type AdminSettingsPageProps = {
  integrations: IntegrationSetting[];
  metaAccounts: MetaAdAccount[];
  view?: SettingsView;
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

function SaveButton({ testConnection = false }: { testConnection?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending}>
      {pending
        ? testConnection
          ? "Testando conexão..."
          : "Salvando..."
        : testConnection
          ? "Salvar e testar conexão"
          : "Salvar credenciais"}
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
    ) : integration.provider === "waha" ? (
      <MessageCircle className="size-5" />
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
                    type="password"
                    autoComplete="new-password"
                    placeholder={integration.config.app_secret_configured === "true" ? "Chave salva — deixe vazio para manter" : "Cole o App Secret"}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="meta_access_token">Access Token compartilhado</Label>
                  <Input
                    id="meta_access_token"
                    name="config_access_token"
                    type="password"
                    autoComplete="new-password"
                    placeholder={integration.config.access_token_configured === "true" ? "Token salvo — deixe vazio para manter" : "Cole o Access Token"}
                  />
                </div>
              </div>

              {/* As contas de anúncio ficam na lista abaixo. O Ad Account ID
                  antigo é preservado oculto para não perder dados ao salvar. */}
              <input
                type="hidden"
                name="config_ad_account_id"
                defaultValue={integration.config.ad_account_id ?? ""}
              />

              <p className="text-sm text-muted-foreground">
                Informe aqui o App ID, App Secret e o Access Token compartilhado da
                sua Business Manager. As contas de anúncio são cadastradas na aba{" "}
                <strong className="text-foreground">Contas Meta</strong>.
              </p>

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
                  type="password"
                  autoComplete="new-password"
                  placeholder={integration.config.api_key_configured === "true" ? "Chave salva — deixe vazio para manter" : "Cole a API Key"}
                />
              </div>
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground md:col-span-2">
                O modelo selecionado sera usado na geracao dos relatorios da pagina de IA.
              </div>
            </div>
          ) : null}

          {integration.provider === "waha" ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="waha_base_url">URL da API WAHA</Label>
                  <Input
                    id="waha_base_url"
                    name="config_base_url"
                    type="url"
                    required
                    placeholder="https://waha.seudominio.com"
                    defaultValue={integration.config.base_url ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="waha_api_key">WAHA_API_KEY</Label>
                  <Input
                    id="waha_api_key"
                    name="config_api_key"
                    type="password"
                    autoComplete="new-password"
                    required={integration.config.api_key_configured !== "true"}
                    placeholder={integration.config.api_key_configured === "true" ? "Chave salva — deixe vazio para manter" : "Cole a WAHA_API_KEY"}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="waha_leads_webhook_url">
                    Webhook de produção do n8n para leads
                  </Label>
                  <Input
                    id="waha_leads_webhook_url"
                    name="config_leads_webhook_url"
                    type="url"
                    placeholder="https://n8n.seudominio.com/webhook/waha-eventos"
                    defaultValue={integration.config.leads_webhook_url ?? ""}
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    Use a URL de produção do workflow WAHA. Sem ela, a conexão
                    continua funcionando, mas mensagens não entram na fila de leads.
                  </p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="waha_webhook_secret">
                    Segredo compartilhado com o n8n
                  </Label>
                  <Input
                    id="waha_webhook_secret"
                    name="config_webhook_secret"
                    type="password"
                    autoComplete="new-password"
                    minLength={32}
                    placeholder={
                      integration.config.webhook_secret_configured === "true"
                        ? "Segredo salvo — deixe vazio para manter"
                        : "Use uma chave aleatória com pelo menos 32 caracteres"
                    }
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    No n8n, use o mesmo valor em uma credencial Header Auth com
                    o nome x-trafegoacademy-secret. Ele é enviado em um header
                    HTTPS e também assina o payload com HMAC.
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm leading-6 text-muted-foreground">
                A chave fica salva no banco e só é lida pelo servidor. Ela não é exibida novamente nem enviada ao navegador dos clientes.
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

          {integration.provider !== "supabase" ? (
            <SaveButton testConnection={integration.provider === "waha"} />
          ) : null}

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

export function AdminSettingsPage({
  integrations,
  metaAccounts,
  view = "integracoes",
}: AdminSettingsPageProps) {
  if (view === "contas") {
    return <MetaAccountsManager accounts={metaAccounts} />;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {integrations.map((integration) => (
        <IntegrationCard key={integration.provider} integration={integration} />
      ))}
    </div>
  );
}
