"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import {
  addMetaAccountAction,
  removeMetaAccountAction,
  toggleMetaAccountAction,
  type MetaAccountActionState,
} from "@/app/admin/configuracoes/actions";
import { Badge } from "@/components/ui/badge";
import { FormPendingButton } from "@/components/ui/form-pending-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MetaAdAccount } from "@/lib/types";

type MetaAccountsManagerProps = {
  accounts: MetaAdAccount[];
};

const initialState: MetaAccountActionState = {};

function statusBadge(status: MetaAdAccount["status"]) {
  if (status === "ok") {
    return <Badge variant="success">Sincronizada</Badge>;
  }

  if (status === "error") {
    return <Badge variant="outline">Erro</Badge>;
  }

  return <Badge variant="secondary">Pendente</Badge>;
}

export function MetaAccountsManager({ accounts }: MetaAccountsManagerProps) {
  const [addState, addAction] = useActionState(addMetaAccountAction, initialState);
  const [toggleState, toggleAction] = useActionState(
    toggleMetaAccountAction,
    initialState,
  );
  const [removeState, removeAction] = useActionState(
    removeMetaAccountAction,
    initialState,
  );

  const feedback = addState.error
    ? { error: addState.error }
    : toggleState.error
      ? { error: toggleState.error }
      : removeState.error
        ? { error: removeState.error }
        : addState.success
          ? { success: addState.success }
          : toggleState.success
            ? { success: toggleState.success }
            : removeState.success
              ? { success: removeState.success }
              : null;

  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-card px-4 py-4">
      <div>
        <p className="font-medium text-foreground">Contas de anúncio</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Cadastre todas as contas que você gerencia. Cada conta usa o Access Token
          compartilhado acima — informe um token próprio só se a conta exigir um
          acesso diferente.
        </p>
      </div>

      {accounts.length > 0 ? (
        <ul className="space-y-3">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{account.label}</p>
                    {statusBadge(account.status)}
                    {account.hasOwnToken ? (
                      <Badge variant="secondary">Token próprio</Badge>
                    ) : null}
                    {!account.enabled ? (
                      <Badge variant="outline">Desativada</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 break-all text-sm text-muted-foreground">
                    {account.adAccountId}
                  </p>
                  {account.status === "error" && account.lastMessage ? (
                    <p className="mt-1 text-xs text-destructive">{account.lastMessage}</p>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <form action={toggleAction}>
                    <input type="hidden" name="id" value={account.id} />
                    <input
                      type="hidden"
                      name="enabled"
                      value={(!account.enabled).toString()}
                    />
                    <FormPendingButton
                      type="submit"
                      variant="outline"
                      className="h-9 rounded-full px-4 text-sm"
                      idleLabel={account.enabled ? "Desativar" : "Ativar"}
                      pendingLabel="..."
                    >
                      {account.enabled ? "Desativar" : "Ativar"}
                    </FormPendingButton>
                  </form>
                  <form action={removeAction}>
                    <input type="hidden" name="id" value={account.id} />
                    <FormPendingButton
                      type="submit"
                      variant="outline"
                      className="size-9 rounded-full border-destructive/40 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      idleLabel="Remover"
                      pendingLabel=""
                      aria-label={`Remover ${account.label}`}
                    >
                      <Trash2 className="size-4" />
                    </FormPendingButton>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/60 px-4 py-6 text-sm text-muted-foreground">
          Nenhuma conta cadastrada ainda. Adicione a primeira abaixo.
        </div>
      )}

      <form action={addAction} className="space-y-3 rounded-2xl border border-border/60 bg-background/60 px-4 py-4">
        <p className="text-sm font-medium text-foreground">Adicionar conta</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="meta_account_label">Apelido</Label>
            <Input
              id="meta_account_label"
              name="label"
              placeholder="Ex.: Clínica Alpha"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meta_account_id">Ad Account ID</Label>
            <Input
              id="meta_account_id"
              name="adAccountId"
              placeholder="act_123456789"
              required
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="meta_account_token">Token próprio (opcional)</Label>
            <Input
              id="meta_account_token"
              name="accessToken"
              placeholder="Deixe em branco para usar o token compartilhado acima"
            />
          </div>
        </div>

        {feedback?.error ? (
          <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {feedback.error}
          </p>
        ) : null}

        {feedback?.success ? (
          <p className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
            {feedback.success}
          </p>
        ) : null}

        <FormPendingButton
          type="submit"
          className="w-full sm:w-auto"
          idleLabel="Adicionar conta"
          pendingLabel="Adicionando..."
        >
          Adicionar conta
        </FormPendingButton>
      </form>
    </div>
  );
}
