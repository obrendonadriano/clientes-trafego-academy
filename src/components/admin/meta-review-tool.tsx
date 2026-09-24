"use client";

import { useState, useTransition } from "react";
import {
  CircleCheck,
  CircleSlash,
  LoaderCircle,
  RefreshCw,
  Send,
  TriangleAlert,
} from "lucide-react";
import {
  createTestTemplateAction,
  listTemplatesAction,
  sendTestMessageAction,
  type CreateTemplateResult,
  type SendMessageResult,
} from "@/app/admin/meta-review/actions";
import { Card, CardContent } from "@/components/ui/card";
import {
  suggestTemplateName,
  TEMPLATE_CATEGORIES,
  type ReviewTemplate,
} from "@/lib/meta/review-validation";
import { cn } from "@/lib/utils";

// FERRAMENTA TEMPORÁRIA de App Review.
//
// Nenhum valor de variável de ambiente chega aqui: o servidor manda apenas
// "configurado" ou "não configurado". O token nunca passa por este arquivo.

const control =
  "h-11 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";

type ConfigStatus = {
  ready: boolean;
  missing: string[];
  hasPhoneNumberId: boolean;
  hasWabaId: boolean;
  hasAccessToken: boolean;
  graphVersion: string;
};

function ConfigLine({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-medium",
          ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
        )}
      >
        {ok ? (
          <CircleCheck className="size-4" aria-hidden />
        ) : (
          <CircleSlash className="size-4" aria-hidden />
        )}
        {ok ? "Configurado" : "Não configurado"}
      </span>
    </div>
  );
}

function Result({
  tone,
  children,
}: {
  tone: "ok" | "error";
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-xl border px-3 py-2.5 text-sm leading-6",
        tone === "ok"
          ? "border-emerald-500/30 bg-emerald-500/10"
          : "border-destructive/30 bg-destructive/10",
      )}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? (
        <span className="block text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

export function MetaReviewTool({ config }: { config: ConfigStatus }) {
  const [pending, startTransition] = useTransition();

  // --- envio de mensagem ---------------------------------------------------
  const [to, setTo] = useState("");
  const [templateName, setTemplateName] = useState("hello_world");
  const [language, setLanguage] = useState("en_US");
  const [sendResult, setSendResult] = useState<SendMessageResult | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // --- criação de modelo ---------------------------------------------------
  const [newName, setNewName] = useState(() => suggestTemplateName());
  const [newLanguage, setNewLanguage] = useState("pt_BR");
  const [newCategory, setNewCategory] = useState("UTILITY");
  const [newBody, setNewBody] = useState(
    "Esta é uma mensagem de teste da integração da Tráfego Academy.",
  );
  const [createResult, setCreateResult] = useState<CreateTemplateResult | null>(
    null,
  );
  const [createError, setCreateError] = useState<string | null>(null);

  // --- lista ---------------------------------------------------------------
  const [templates, setTemplates] = useState<ReviewTemplate[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const disabled = pending || !config.ready;

  function send() {
    setSendError(null);
    setSendResult(null);

    startTransition(async () => {
      const result = await sendTestMessageAction({ to, templateName, language });

      if (result.ok) {
        setSendResult(result.data);
      } else {
        setSendError(
          result.code ? `${result.error} (código ${result.code})` : result.error,
        );
      }
    });
  }

  function createTemplate() {
    // Ação real e irreversível na conta de teste: confirmar evita criar um
    // modelo a cada clique repetido durante a gravação.
    if (
      !window.confirm(
        `Criar o modelo "${newName}" no WABA de teste? Esta ação é real na Meta.`,
      )
    ) {
      return;
    }

    setCreateError(null);
    setCreateResult(null);

    startTransition(async () => {
      const result = await createTestTemplateAction({
        name: newName,
        language: newLanguage,
        category: newCategory,
        body: newBody,
      });

      if (result.ok) {
        setCreateResult(result.data);
        // Um nome novo para a próxima tentativa, sem colidir.
        setNewName(suggestTemplateName());
      } else {
        setCreateError(
          result.code ? `${result.error} (código ${result.code})` : result.error,
        );
      }
    });
  }

  function refreshList() {
    setListError(null);

    startTransition(async () => {
      const result = await listTemplatesAction();

      if (result.ok) {
        setTemplates(result.data);
      } else {
        setListError(result.error);
      }
    });
  }

  return (
    <div className="min-w-0 space-y-5" aria-busy={pending}>
      <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm leading-6">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          Ferramenta interna e temporária utilizada exclusivamente para
          demonstrar permissões da Meta durante o processo de App Review.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3 py-5">
          <h2 className="font-display text-lg font-semibold">Configuração</h2>
          <div className="space-y-2">
            <ConfigLine
              label="Número de teste da Meta"
              ok={config.hasPhoneNumberId}
            />
            <ConfigLine label="WABA de teste" ok={config.hasWabaId} />
            <ConfigLine label="Access token" ok={config.hasAccessToken} />
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Versão da Graph API</span>
              <span className="font-mono text-xs">{config.graphVersion}</span>
            </div>
          </div>

          {!config.ready ? (
            <Result tone="error">
              <p className="font-medium">
                Configuração do Meta App Review incompleta.
              </p>
              <p className="mt-1">
                Faltando:{" "}
                <span className="font-mono text-xs">
                  {config.missing.join(", ")}
                </span>
              </p>
            </Result>
          ) : null}
        </CardContent>
      </Card>

      {/* ---------------- whatsapp_business_messaging ---------------- */}
      <Card>
        <CardContent className="space-y-4 py-5">
          <div>
            <h2 className="font-display text-lg font-semibold">
              Teste de envio de mensagem
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Evidência da permissão{" "}
              <span className="font-mono text-xs">
                whatsapp_business_messaging
              </span>
              . Usa modelo aprovado para não depender da janela de 24 horas.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Destinatário" hint="Com código do país. Ex.: 5514999990000">
              <input
                className={control}
                value={to}
                inputMode="tel"
                onChange={(event) => setTo(event.target.value)}
                placeholder="5514999990000"
                disabled={disabled}
              />
            </Field>
            <Field label="Modelo" hint="Nome exato do template aprovado">
              <input
                className={control}
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="hello_world"
                disabled={disabled}
              />
            </Field>
            <Field label="Idioma" hint="Código da Meta. Ex.: en_US, pt_BR">
              <input
                className={control}
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                placeholder="en_US"
                disabled={disabled}
              />
            </Field>
          </div>

          <button
            type="button"
            onClick={send}
            disabled={disabled || !to.trim()}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            Enviar mensagem de teste
          </button>

          {sendResult ? (
            <Result tone="ok">
              <p className="font-medium">✅ Mensagem enviada com sucesso</p>
              <p className="mt-1.5">
                Phone Number ID:{" "}
                <span className="font-mono text-xs">
                  {sendResult.phoneNumberId}
                </span>
              </p>
              <p className="break-all">
                Message ID:{" "}
                <span className="font-mono text-xs">
                  {sendResult.messageId ?? "—"}
                </span>
              </p>
            </Result>
          ) : null}

          {sendError ? (
            <Result tone="error">
              <p className="font-medium">❌ Não foi possível enviar</p>
              <p className="mt-1">{sendError}</p>
            </Result>
          ) : null}
        </CardContent>
      </Card>

      {/* ---------------- whatsapp_business_management ---------------- */}
      <Card>
        <CardContent className="space-y-4 py-5">
          <div>
            <h2 className="font-display text-lg font-semibold">
              Criar modelo de mensagem
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Evidência da permissão{" "}
              <span className="font-mono text-xs">
                whatsapp_business_management
              </span>
              , gerenciando ativos do WABA de teste.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Nome do modelo" hint="Minúsculas, números e underline">
              <input
                className={control}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                disabled={disabled}
              />
            </Field>
            <Field label="Idioma">
              <input
                className={control}
                value={newLanguage}
                onChange={(event) => setNewLanguage(event.target.value)}
                disabled={disabled}
              />
            </Field>
            <Field label="Categoria">
              <select
                className={control}
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                disabled={disabled}
              >
                {TEMPLATE_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Mensagem">
            <textarea
              className={cn(control, "h-auto min-h-24 py-2.5")}
              value={newBody}
              onChange={(event) => setNewBody(event.target.value)}
              disabled={disabled}
            />
          </Field>

          <button
            type="button"
            onClick={createTemplate}
            disabled={disabled || !newName.trim()}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <CircleCheck className="size-4" aria-hidden />
            )}
            Criar modelo de teste
          </button>

          {createResult ? (
            <Result tone="ok">
              <p className="font-medium">✅ Modelo criado com sucesso</p>
              <p className="mt-1.5 break-all">
                Template ID:{" "}
                <span className="font-mono text-xs">
                  {createResult.id ?? "—"}
                </span>
              </p>
              <p>
                Status:{" "}
                <span className="font-mono text-xs">
                  {createResult.status ?? "—"}
                </span>
              </p>
              <p>
                Categoria:{" "}
                <span className="font-mono text-xs">
                  {createResult.category ?? "—"}
                </span>
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                PENDING é o estado normal logo após a criação: a Meta ainda vai
                revisar o modelo.
              </p>
            </Result>
          ) : null}

          {createError ? (
            <Result tone="error">
              <p className="font-medium">❌ Não foi possível criar</p>
              <p className="mt-1">{createError}</p>
            </Result>
          ) : null}
        </CardContent>
      </Card>

      {/* ---------------- lista ---------------- */}
      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold">
              Modelos do WABA de teste
            </h2>
            <button
              type="button"
              onClick={refreshList}
              disabled={disabled}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/70 px-3 text-sm disabled:opacity-50"
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="size-4" aria-hidden />
              )}
              Atualizar lista
            </button>
          </div>

          {listError ? <Result tone="error">{listError}</Result> : null}

          {templates === null ? (
            <p className="text-sm text-muted-foreground">
              Clique em “Atualizar lista” para carregar os modelos do WABA de
              teste.
            </p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum modelo encontrado neste WABA.
            </p>
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Nome</th>
                    <th className="px-3 py-2 font-medium">Idioma</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Categoria</th>
                    <th className="px-3 py-2 font-medium">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-border/40 last:border-b-0"
                    >
                      <td className="px-3 py-2 font-medium">{item.name}</td>
                      <td className="px-3 py-2">{item.language}</td>
                      <td className="px-3 py-2">{item.status}</td>
                      <td className="px-3 py-2">{item.category}</td>
                      <td className="px-3 py-2 font-mono text-xs">{item.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
