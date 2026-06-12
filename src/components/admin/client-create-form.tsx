"use client";

import { useActionState, useRef, useState } from "react";
import {
  checkAvailabilityAction,
  createClientWorkspaceAction,
  type AdminActionState,
} from "@/app/admin/actions";
import { CampaignMultiSelect } from "@/components/admin/campaign-multi-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormPendingButton } from "@/components/ui/form-pending-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CampaignWithMetrics } from "@/lib/types";

type ClientCreateFormProps = {
  campaigns: CampaignWithMetrics[];
};

const initialState: AdminActionState = {};

function SectionHeading({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
        {step}
      </span>
      <p className="font-display text-lg font-semibold text-foreground">{title}</p>
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-destructive">{message}</p>;
}

export function ClientCreateForm({ campaigns }: ClientCreateFormProps) {
  const [state, formAction] = useActionState(createClientWorkspaceAction, initialState);
  // Erros detectados no blur (disponibilidade) sobrepõem-se aos do servidor.
  const [liveErrors, setLiveErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const fieldErrors = { ...state.fieldErrors, ...liveErrors };

  async function handleAvailabilityBlur(field: "username" | "email", value: string) {
    const trimmed = value.trim();

    if (!trimmed) {
      return;
    }

    const result = await checkAvailabilityAction(
      field === "username" ? { username: trimmed } : { email: trimmed },
    );

    setLiveErrors((current) => {
      const next = { ...current };

      if (field === "username") {
        if (result.usernameTaken) {
          next.username = "Este usuário já está em uso.";
        } else {
          delete next.username;
        }
      } else {
        if (result.emailTaken) {
          next.email = "Este email já está cadastrado.";
        } else {
          delete next.email;
        }
      }

      return next;
    });
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="font-display text-2xl">Novo cliente</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          Três passos no mesmo formulário: empresa, acesso ao portal e campanhas
          liberadas. Tudo validado antes de salvar.
        </p>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4 overflow-hidden">
        <form
          ref={formRef}
          action={formAction}
          className="min-w-0 space-y-6 overflow-hidden"
        >
          <section className="space-y-4">
            <SectionHeading step={1} title="Dados da empresa" />
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="companyName">Nome da empresa</Label>
                <Input id="companyName" name="companyName" required minLength={2} />
                <FieldError message={fieldErrors.companyName} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactName">Responsável</Label>
                <Input id="contactName" name="contactName" required minLength={2} />
                <FieldError message={fieldErrors.contactName} />
              </div>
            </div>
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <Input
                  id="whatsapp"
                  name="whatsapp"
                  required
                  inputMode="tel"
                  placeholder="+55 11 99999-0000"
                />
                <FieldError message={fieldErrors.whatsapp} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Observações (opcional)</Label>
                <Textarea id="notes" name="notes" className="min-h-[44px]" />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeading step={2} title="Acesso ao portal" />
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="accountName">Nome exibido</Label>
                <Input id="accountName" name="accountName" required minLength={2} />
                <FieldError message={fieldErrors.accountName} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Usuário</Label>
                <Input
                  id="username"
                  name="username"
                  required
                  minLength={3}
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="ex.: empresa01"
                  onBlur={(event) =>
                    handleAvailabilityBlur("username", event.target.value)
                  }
                />
                <FieldError message={fieldErrors.username} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email de acesso</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  onBlur={(event) => handleAvailabilityBlur("email", event.target.value)}
                />
                <FieldError message={fieldErrors.email} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha inicial</Label>
                <Input id="password" name="password" type="password" required minLength={6} />
                <FieldError message={fieldErrors.password} />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeading step={3} title="Campanhas liberadas" />
            {campaigns.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 px-4 py-3 text-sm text-muted-foreground">
                Ainda não há campanhas cadastradas. Sincronize a Meta Ads em
                Campanhas e volte para liberar o acesso.
              </div>
            ) : (
              <CampaignMultiSelect campaigns={campaigns} showSelectionSummary />
            )}
          </section>

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

          <FormPendingButton
            type="submit"
            className="w-full"
            size="lg"
            idleLabel="Criar cliente"
            pendingLabel="Criando cliente..."
          >
            Criar cliente
          </FormPendingButton>
        </form>
      </CardContent>
    </Card>
  );
}
