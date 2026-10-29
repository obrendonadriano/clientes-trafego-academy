"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  Ban,
  KeyRound,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  addBlockedNumberAction,
  deleteBlockedNumberAction,
  restoreAiActivationAction,
  saveAiActivationAction,
  toggleBlockedNumberAction,
  updateBlockedNumberAction,
  type AiAgentActionState,
} from "@/app/dashboard/atendimento-ia/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormPendingButton } from "@/components/ui/form-pending-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import type { AiBlockedNumber } from "@/lib/ai-agent/blocked";
import {
  MAX_ACTIVATION_PHRASES,
  type AiActivation,
} from "@/lib/ai-agent/config";
import {
  formatBrazilianWhatsapp,
  formatWhatsappInternational,
  maskBrazilianPhone,
} from "@/lib/ai-agent/shared";
import { cn } from "@/lib/utils";

const initialState: AiAgentActionState = {};

function useActionToast(state: AiAgentActionState) {
  const { showToast } = useToast();

  useEffect(() => {
    if (state.success) showToast({ message: state.success });
    else if (state.error) showToast({ message: state.error, tone: "erro" });
  }, [showToast, state]);
}

function PhoneInput({
  id,
  defaultValue = "",
  invalid,
  autoFocus,
}: {
  id: string;
  defaultValue?: string;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState(maskBrazilianPhone(defaultValue));

  return (
    <div
      className={cn(
        "flex h-10 items-center overflow-hidden rounded-xl border bg-card focus-within:ring-2 focus-within:ring-ring",
        invalid ? "border-destructive" : "border-border",
      )}
    >
      <span className="flex h-full items-center border-r border-border bg-surface-2 px-3 text-sm font-medium text-muted-foreground">
        +55
      </span>
      <input
        id={id}
        name="whatsappNumber"
        type="tel"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder="(11) 91234-5678"
        value={value}
        onChange={(event) => setValue(maskBrazilianPhone(event.target.value))}
        aria-invalid={invalid || undefined}
        className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm tabular-nums outline-none placeholder:text-muted-foreground"
        required
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Frases de ativação
// ---------------------------------------------------------------------------

/** Lista editável de frases; cada uma vai no form como `activationPhrase`. */
export function ActivationPhrasesEditor({
  defaultPhrases,
  onChange,
  required = true,
}: {
  defaultPhrases: string[];
  // O quiz acompanha as frases para validar o passo e montar o resumo.
  onChange?: (phrases: string[]) => void;
  // Falso quando o editor fica num passo escondido do quiz: campo obrigatório
  // escondido trava o envio do formulário no navegador.
  required?: boolean;
}) {
  // Ids estáveis para o React não trocar o texto de lugar ao remover.
  const [items, setItems] = useState(() =>
    defaultPhrases.map((text, index) => ({ id: index, text })),
  );
  const [nextId, setNextId] = useState(defaultPhrases.length);

  const commit = (list: { id: number; text: string }[]) => {
    setItems(list);
    onChange?.(list.map((item) => item.text));
  };
  const update = (id: number, text: string) =>
    commit(items.map((item) => (item.id === id ? { ...item, text } : item)));

  return (
    <div className="space-y-2">
      <Label>Frases que ativam a IA</Label>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={item.id} className="flex items-center gap-2">
            <Input
              name="activationPhrase"
              value={item.text}
              onChange={(event) => update(item.id, event.target.value)}
              aria-label={`Frase ${index + 1}`}
              placeholder="Ex.: Olá! Quero vender meu carro financiado."
              minLength={required ? 3 : undefined}
              maxLength={200}
              required={required}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-10 shrink-0"
              aria-label={`Remover frase ${index + 1}`}
              disabled={items.length === 1}
              onClick={() =>
                commit(items.filter((entry) => entry.id !== item.id))
              }
            >
              <X className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
      {items.length < MAX_ACTIVATION_PHRASES ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            commit([...items, { id: nextId, text: "" }]);
            setNextId(nextId + 1);
          }}
        >
          <Plus className="mr-2 size-4" />
          Adicionar frase
        </Button>
      ) : null}
      <p className="text-xs leading-5 text-muted-foreground">
        Maiúsculas, acentos, pontuação e emojis não fazem diferença. O lead pode
        escrever mais coisa junto, desde que uma das frases esteja na mensagem.
      </p>
    </div>
  );
}

export function AiActivationCard({ activation }: { activation: AiActivation }) {
  const [saveState, saveAction] = useActionState(
    saveAiActivationAction,
    initialState,
  );
  const [restoreState, restoreAction] = useActionState(
    restoreAiActivationAction,
    initialState,
  );

  useActionToast(saveState);
  useActionToast(restoreState);

  const formKey = `${activation.enabled}-${activation.phrases.join("|")}`;

  return (
    <Card className="min-w-0">
      <CardHeader className="flex items-center gap-3">
        <div className="rounded-2xl bg-primary/12 p-3 text-primary">
          <KeyRound className="size-5" strokeWidth={1.75} />
        </div>
        <div>
          <CardTitle className="font-display text-xl">
            Frases de ativação
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            A IA só inicia conversa com quem chega por uma destas frases, a
            mensagem pronta dos seus anúncios. Conversas já abertas continuam
            normalmente.
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <form key={formKey} action={saveAction} className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-2xl border border-border/60 bg-card px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                Exigir frase de ativação
              </p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                Desligado, a IA responde qualquer número novo. Ligado, quem
                chega pelo anúncio sempre é atendido, e a mensagem pronta do
                botão do anúncio vale em qualquer idioma do celular.
              </p>
            </div>
            <Switch
              name="activationEnabled"
              defaultChecked={activation.enabled}
              aria-label="Exigir frase de ativação"
            />
          </div>

          <ActivationPhrasesEditor defaultPhrases={activation.phrases} />

          <FormPendingButton
            type="submit"
            idleLabel="Salvar frases"
            pendingLabel="Salvando..."
          />
        </form>

        <form action={restoreAction}>
          <FormPendingButton
            type="submit"
            variant="outline"
            idleLabel="Restaurar frases padrão"
            pendingLabel="Restaurando..."
          >
            <RotateCcw className="mr-2 size-4" />
            Restaurar frases padrão
          </FormPendingButton>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Números bloqueados
// ---------------------------------------------------------------------------

function StatusBadge({ blocked }: { blocked: boolean }) {
  return blocked ? (
    <Badge className="gap-1 bg-[#fef3f2] text-[#b42318]">
      <Ban className="size-3" />
      Bloqueado
    </Badge>
  ) : (
    <Badge variant="success" className="gap-1">
      <ShieldCheck className="size-3" />
      Liberado
    </Badge>
  );
}

function AddBlockedNumberForm() {
  const [state, action] = useActionState(addBlockedNumberAction, initialState);
  // Recria o formulário depois de cada bloqueio para limpar os campos.
  const [formKey, setFormKey] = useState(0);
  const [handled, setHandled] = useState(state);

  useActionToast(state);
  if (state !== handled) {
    setHandled(state);
    if (state.success) setFormKey(formKey + 1);
  }

  return (
    <form
      key={formKey}
      action={action}
      className="grid gap-3 rounded-2xl border border-border/60 bg-surface-2/40 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
    >
      <div className="space-y-1.5">
        <Label htmlFor="blocked-new-number">WhatsApp (DDD + número)</Label>
        <PhoneInput
          id="blocked-new-number"
          invalid={Boolean(state.fieldErrors?.whatsappNumber)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="blocked-new-label">
          Identificação <span className="text-muted-foreground">(opcional)</span>
        </Label>
        <Input
          id="blocked-new-label"
          name="label"
          placeholder="Ex.: Fornecedor, equipe"
          maxLength={80}
        />
      </div>
      <FormPendingButton
        type="submit"
        idleLabel="Bloquear número"
        pendingLabel="Bloqueando..."
      />
      {state.fieldErrors?.whatsappNumber ? (
        <p className="text-xs text-destructive sm:col-span-3">
          {state.fieldErrors.whatsappNumber}
        </p>
      ) : null}
    </form>
  );
}

function BlockedNumberRow({ item }: { item: AiBlockedNumber }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [updateState, updateAction] = useActionState(
    updateBlockedNumberAction,
    initialState,
  );
  const [toggleState, toggleAction] = useActionState(
    toggleBlockedNumberAction,
    initialState,
  );
  const [deleteState, deleteAction] = useActionState(
    deleteBlockedNumberAction,
    initialState,
  );

  useActionToast(updateState);
  useActionToast(toggleState);
  useActionToast(deleteState);
  // Fecha a edição quando o servidor confirma; erro mantém o formulário aberto.
  const [handled, setHandled] = useState(updateState);
  if (updateState !== handled) {
    setHandled(updateState);
    if (updateState.success) setEditing(false);
  }

  if (editing) {
    return (
      <li className="rounded-2xl border border-primary/30 bg-card p-4">
        <form
          action={updateAction}
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-end"
        >
          <input type="hidden" name="id" value={item.id} />
          <div className="space-y-1.5">
            <Label htmlFor={`blocked-${item.id}-number`}>WhatsApp</Label>
            <PhoneInput
              id={`blocked-${item.id}-number`}
              defaultValue={item.whatsappNumber}
              invalid={Boolean(updateState.fieldErrors?.whatsappNumber)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`blocked-${item.id}-label`}>Identificação</Label>
            <Input
              id={`blocked-${item.id}-label`}
              name="label"
              defaultValue={item.label ?? ""}
              maxLength={80}
            />
          </div>
          {updateState.fieldErrors?.whatsappNumber ? (
            <p className="text-xs text-destructive sm:col-span-2">
              {updateState.fieldErrors.whatsappNumber}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <FormPendingButton
              type="submit"
              idleLabel="Salvar"
              pendingLabel="Salvando..."
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium tabular-nums text-foreground">
            {formatWhatsappInternational(item.whatsappNumber)}
          </span>
          <StatusBadge blocked={item.blocked} />
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {item.label ?? "Sem identificação"} · desde{" "}
          {new Date(item.createdAt).toLocaleDateString("pt-BR")}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <form action={toggleAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={item.id} />
          <input
            type="hidden"
            name="blocked"
            value={item.blocked ? "false" : "true"}
          />
          <span className="text-xs text-muted-foreground">Bloquear</span>
          <Switch
            key={String(item.blocked)}
            defaultChecked={item.blocked}
            aria-label={
              item.blocked
                ? `Liberar ${formatBrazilianWhatsapp(item.whatsappNumber)}`
                : `Bloquear ${formatBrazilianWhatsapp(item.whatsappNumber)}`
            }
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          />
        </form>

        {confirmDelete ? (
          <form action={deleteAction} className="flex items-center gap-1">
            <input type="hidden" name="id" value={item.id} />
            <FormPendingButton
              type="submit"
              className="h-9 bg-[#d92d20] bg-none px-3 text-white hover:brightness-110"
              idleLabel="Excluir"
              pendingLabel="Excluindo..."
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9"
              aria-label="Cancelar exclusão"
              onClick={() => setConfirmDelete(false)}
            >
              <X className="size-4" />
            </Button>
          </form>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9"
              aria-label={`Editar ${formatBrazilianWhatsapp(item.whatsappNumber)}`}
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 text-[#b42318] hover:bg-[#fef3f2]"
              aria-label={`Excluir ${formatBrazilianWhatsapp(item.whatsappNumber)}`}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

export function AiBlockedNumbersCard({
  numbers,
}: {
  numbers: AiBlockedNumber[];
}) {
  const [query, setQuery] = useState("");
  const blockedCount = numbers.filter((item) => item.blocked).length;

  const visible = useMemo(() => {
    const digits = query.replace(/\D/g, "");
    const text = query.trim().toLowerCase();
    if (!text) return numbers;
    return numbers.filter(
      (item) =>
        (digits && item.whatsappNumber.includes(digits)) ||
        item.label?.toLowerCase().includes(text),
    );
  }, [numbers, query]);

  return (
    <Card className="min-w-0">
      <CardHeader className="flex items-center gap-3">
        <div className="rounded-2xl bg-primary/12 p-3 text-primary">
          <Ban className="size-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <CardTitle className="font-display text-xl">
            Números bloqueados
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            A IA não responde nem abre conversa com estes números. Use para
            equipe, fornecedores e contatos pessoais.
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <AddBlockedNumberForm />

        {numbers.length ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {blockedCount} bloqueado{blockedCount === 1 ? "" : "s"}
                {numbers.length - blockedCount
                  ? ` · ${numbers.length - blockedCount} liberado${
                      numbers.length - blockedCount === 1 ? "" : "s"
                    }`
                  : ""}
              </p>
              {numbers.length > 5 ? (
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar número ou nome"
                    aria-label="Buscar número bloqueado"
                    className="pl-9"
                  />
                </div>
              ) : null}
            </div>

            {visible.length ? (
              <ul className="space-y-2">
                {visible.map((item) => (
                  <BlockedNumberRow key={item.id} item={item} />
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Nenhum número encontrado.
              </p>
            )}
          </>
        ) : (
          <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Nenhum número bloqueado. Todos os leads que chegarem pela frase de
            ativação são atendidos.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
