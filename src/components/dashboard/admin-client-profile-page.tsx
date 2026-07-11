"use client";

import Link from "next/link";
import type { KeyboardEvent } from "react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  AtSign,
  Building2,
  ChevronLeft,
  ChevronRight,
  Contact,
  KeyRound,
  Lock,
  Mail,
  Megaphone,
  Phone,
  Trash2,
  User,
} from "lucide-react";
import {
  checkAvailabilityAction,
  deleteClientWorkspaceAction,
  type AdminActionState,
  updateClientWorkspaceAction,
} from "@/app/admin/actions";
import { CampaignMultiSelect } from "@/components/admin/campaign-multi-select";
import {
  Field,
  IconInput,
  SegmentField,
  WHATSAPP_PATTERN,
  WHATSAPP_TITLE,
  formatWhatsapp,
} from "@/components/admin/client-form-fields";
import { FormStepper, type WizardStep } from "@/components/admin/form-stepper";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FormPendingButton } from "@/components/ui/form-pending-button";
import { cn } from "@/lib/utils";
import { summarizeMetrics } from "@/lib/dashboard-metrics";
import type { CampaignWithMetrics, Client, RawCampaignMetric, User as UserType } from "@/lib/types";

type AdminClientProfilePageProps = {
  client: Client;
  linkedUser: UserType | null;
  selectedCampaignIds: string[];
  allCampaigns: CampaignWithMetrics[];
  metricRows: RawCampaignMetric[];
};

const initialState: AdminActionState = {};

const STEPS: (WizardStep & { fields: string[] })[] = [
  {
    id: "empresa",
    title: "Empresa",
    description: "Dados do cliente, contato e status.",
    icon: Building2,
    fields: ["companyName", "contactName", "whatsapp", "notes"],
  },
  {
    id: "acesso",
    title: "Acesso",
    description: "Login do portal e situação do acesso.",
    icon: KeyRound,
    fields: ["accountName", "username", "email", "password"],
  },
  {
    id: "campanhas",
    title: "Campanhas",
    description: "O que este cliente pode acompanhar.",
    icon: Megaphone,
    fields: ["campaignIds"],
  },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMultiplier(value: number) {
  return `${value.toFixed(2).replace(".", ",")}x`;
}

export function AdminClientProfilePage({
  client,
  linkedUser,
  selectedCampaignIds,
  allCampaigns,
  metricRows,
}: AdminClientProfilePageProps) {
  const router = useRouter();
  const [updateState, updateAction] = useActionState(
    updateClientWorkspaceAction,
    initialState,
  );
  const [deleteState, deleteAction] = useActionState(
    deleteClientWorkspaceAction,
    initialState,
  );

  const [liveErrors, setLiveErrors] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(0);
  const [whatsapp, setWhatsapp] = useState(() =>
    formatWhatsapp(client.whatsapp ?? ""),
  );
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [handledState, setHandledState] = useState(updateState);

  const fieldErrors = { ...updateState.fieldErrors, ...liveErrors };
  const isLastStep = current === STEPS.length - 1;
  const activeStep = STEPS[current];

  const summary = useMemo(() => summarizeMetrics(metricRows), [metricRows]);
  const selectedCampaigns = useMemo(
    () => allCampaigns.filter((campaign) => selectedCampaignIds.includes(campaign.id)),
    [allCampaigns, selectedCampaignIds],
  );

  useEffect(() => {
    if (deleteState.success) {
      router.replace("/admin/clientes");
      router.refresh();
    }
  }, [deleteState.success, router]);

  // Erro novo da action de salvar leva ao passo do primeiro campo com problema.
  if (updateState !== handledState) {
    setHandledState(updateState);

    const stepWithError = updateState.fieldErrors
      ? STEPS.findIndex((step) =>
          step.fields.some((field) => updateState.fieldErrors?.[field]),
        )
      : -1;

    if (stepWithError >= 0 && stepWithError !== current) {
      setCurrent(stepWithError);
    }
  }

  async function handleAvailabilityBlur(field: "username" | "email", value: string) {
    const trimmed = value.trim();

    if (!trimmed) {
      return;
    }

    const result = await checkAvailabilityAction(
      field === "username"
        ? { username: trimmed, excludeUserId: linkedUser?.id }
        : { email: trimmed, excludeUserId: linkedUser?.id },
    );

    setLiveErrors((currentErrors) => {
      const next = { ...currentErrors };

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

  function validateStep(index: number) {
    const panel = panelRefs.current[index];

    if (panel) {
      const controls = panel.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >("input, textarea, select");

      for (const control of Array.from(controls)) {
        if (!control.checkValidity()) {
          control.reportValidity();
          return false;
        }
      }
    }

    if (STEPS[index].fields.some((field) => liveErrors[field])) {
      return false;
    }

    return true;
  }

  function goNext() {
    if (!validateStep(current)) {
      return;
    }

    setCurrent((value) => Math.min(value + 1, STEPS.length - 1));
  }

  function goBack() {
    setCurrent((value) => Math.max(value - 1, 0));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter") {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.tagName === "TEXTAREA") {
      return;
    }

    event.preventDefault();
    if (!isLastStep) {
      goNext();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/12 font-display text-xl font-semibold text-primary">
            {client.companyName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
              Perfil do cliente
            </p>
            <h3 className="font-display text-3xl font-semibold">
              {client.companyName}
            </h3>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={client.active ? "success" : "secondary"}>
            {client.active ? "Cliente ativo" : "Cliente inativo"}
          </Badge>
          <Link
            href="/admin/clientes"
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-border px-5 text-sm font-medium text-foreground transition hover:bg-accent"
          >
            <ArrowLeft className="size-4" />
            Voltar para clientes
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Campanhas liberadas"
          value={String(selectedCampaigns.length)}
          change="acessos configurados"
        />
        <MetricCard
          label="Investimento"
          value={formatCurrency(summary.amountSpent)}
          change="somando campanhas permitidas"
        />
        <MetricCard
          label="Leads"
          value={String(Math.round(summary.leads))}
          change="dados da carteira liberada"
        />
        <MetricCard
          label="ROAS médio"
          value={formatMultiplier(summary.roas)}
          change={linkedUser?.active ? "login ativo" : "login inativo"}
          positive={Boolean(linkedUser?.active)}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="min-w-0 border-border/60 bg-background/60">
          <CardHeader className="space-y-5">
            <div>
              <CardTitle className="font-display text-2xl">Editar cliente</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Empresa, acesso e campanhas em três passos.
              </p>
            </div>
            <FormStepper steps={STEPS} current={current} onStepClick={setCurrent} />
          </CardHeader>

          <CardContent className="min-w-0 overflow-hidden">
            <form
              action={updateAction}
              onKeyDown={handleKeyDown}
              className="min-w-0 space-y-6 overflow-hidden"
            >
              <input type="hidden" name="clientId" value={client.id} />
              <input type="hidden" name="userId" value={linkedUser?.id ?? ""} />
              <input type="hidden" name="authUserId" value={linkedUser?.authUserId ?? ""} />

              <div className="flex items-start justify-between gap-3 rounded-2xl border border-border/60 bg-muted/40 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                    <activeStep.icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {activeStep.title}
                    </p>
                    <p className="text-sm leading-5 text-muted-foreground">
                      {activeStep.description}
                    </p>
                  </div>
                </div>
                {current === 1 ? (
                  <Badge variant={linkedUser?.active ? "success" : "secondary"}>
                    {linkedUser ? "Acesso existente" : "Sem acesso"}
                  </Badge>
                ) : null}
              </div>

              {/* PASSO 1 — Empresa */}
              <div
                ref={(node) => {
                  panelRefs.current[0] = node;
                }}
                hidden={current !== 0}
                className="min-w-0 space-y-4"
              >
                <div className="grid min-w-0 gap-4 md:grid-cols-2">
                  <Field
                    label="Nome da empresa"
                    htmlFor="companyName"
                    error={fieldErrors.companyName}
                  >
                    <IconInput
                      icon={Building2}
                      id="companyName"
                      name="companyName"
                      defaultValue={client.companyName}
                      required
                      minLength={2}
                    />
                  </Field>
                  <Field
                    label="Responsável"
                    htmlFor="contactName"
                    error={fieldErrors.contactName}
                  >
                    <IconInput
                      icon={User}
                      id="contactName"
                      name="contactName"
                      defaultValue={client.contactName}
                      required
                      minLength={2}
                    />
                  </Field>
                  <Field label="WhatsApp" htmlFor="whatsapp" error={fieldErrors.whatsapp}>
                    <IconInput
                      icon={Phone}
                      id="whatsapp"
                      name="whatsapp"
                      required
                      inputMode="tel"
                      value={whatsapp}
                      onChange={(event) => setWhatsapp(formatWhatsapp(event.target.value))}
                      pattern={WHATSAPP_PATTERN}
                      title={WHATSAPP_TITLE}
                      placeholder="+55 (11) 99999-9999"
                    />
                  </Field>
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 py-3 text-sm text-foreground md:mt-7">
                    <span className="font-medium">Cliente ativo</span>
                    <Switch name="clientActive" defaultChecked={client.active} />
                  </div>
                  <SegmentField
                    defaultSegment={client.segment}
                    defaultDescription={client.segmentDescription}
                  />
                  <Field
                    label="Observações"
                    htmlFor="notes"
                    optional
                    className="md:col-span-2"
                  >
                    <Textarea
                      id="notes"
                      name="notes"
                      defaultValue={client.notes}
                      className="min-h-[96px]"
                    />
                  </Field>
                </div>
              </div>

              {/* PASSO 2 — Acesso */}
              <div
                ref={(node) => {
                  panelRefs.current[1] = node;
                }}
                hidden={current !== 1}
                className="min-w-0 space-y-4"
              >
                <div className="grid min-w-0 gap-4 md:grid-cols-2">
                  <Field
                    label="Nome exibido"
                    htmlFor="accountName"
                    error={fieldErrors.accountName}
                  >
                    <IconInput
                      icon={Contact}
                      id="accountName"
                      name="accountName"
                      defaultValue={linkedUser?.name ?? client.contactName}
                      required
                      minLength={2}
                    />
                  </Field>
                  <Field label="Login" htmlFor="username" error={fieldErrors.username}>
                    <IconInput
                      icon={AtSign}
                      id="username"
                      name="username"
                      defaultValue={linkedUser?.username ?? ""}
                      required
                      minLength={3}
                      autoCapitalize="none"
                      autoCorrect="off"
                      onBlur={(event) =>
                        handleAvailabilityBlur("username", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Email" htmlFor="email" error={fieldErrors.email}>
                    <IconInput
                      icon={Mail}
                      id="email"
                      name="email"
                      type="email"
                      defaultValue={linkedUser?.email ?? ""}
                      required
                      onBlur={(event) =>
                        handleAvailabilityBlur("email", event.target.value)
                      }
                    />
                  </Field>
                  <Field
                    label={linkedUser ? "Nova senha" : "Senha inicial"}
                    htmlFor="password"
                    optional={Boolean(linkedUser)}
                  >
                    <IconInput
                      icon={Lock}
                      id="password"
                      name="password"
                      type="password"
                      minLength={6}
                      placeholder={
                        linkedUser ? "Preencha só se quiser alterar" : "Defina a senha"
                      }
                    />
                  </Field>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 py-3 text-sm text-foreground">
                  <span className="font-medium">Login ativo para o cliente</span>
                  <Switch name="accessActive" defaultChecked={linkedUser?.active ?? true} />
                </div>
              </div>

              {/* PASSO 3 — Campanhas */}
              <div
                ref={(node) => {
                  panelRefs.current[2] = node;
                }}
                hidden={current !== 2}
                className="min-w-0 space-y-3"
              >
                <CampaignMultiSelect
                  campaigns={allCampaigns}
                  selectedIds={selectedCampaignIds}
                  showSelectionSummary
                />
              </div>

              {updateState.error ? (
                <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {updateState.error}
                </p>
              ) : null}

              {updateState.success ? (
                <p className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
                  {updateState.success}
                </p>
              ) : null}

              <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-5 dark:border-white/10">
                <Button
                  type="button"
                  variant="outline"
                  onClick={goBack}
                  disabled={current === 0}
                  className={cn(current === 0 && "invisible")}
                >
                  <ChevronLeft className="mr-1 size-4" />
                  Voltar
                </Button>

                <span className="text-xs font-medium text-muted-foreground sm:hidden">
                  Passo {current + 1} de {STEPS.length}
                </span>

                {isLastStep ? (
                  <FormPendingButton
                    type="submit"
                    size="lg"
                    idleLabel="Salvar alterações"
                    pendingLabel="Salvando alterações..."
                  >
                    Salvar alterações
                  </FormPendingButton>
                ) : (
                  <Button type="button" size="lg" onClick={goNext}>
                    Próximo
                    <ChevronRight className="ml-1 size-4" />
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/60 bg-background/60">
            <CardHeader>
              <CardTitle className="font-display text-2xl">Resumo do perfil</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card px-4 py-3">
                <Mail className="size-3.5 shrink-0" />
                <span className="min-w-0 break-all">
                  {linkedUser?.email ?? "Ainda sem acesso criado"}
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card px-4 py-3">
                <Phone className="size-3.5 shrink-0" />
                <span className="min-w-0 break-all">{client.whatsapp}</span>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card px-4 py-3">
                <Megaphone className="size-3.5 shrink-0" />
                {selectedCampaigns.length} campanha
                {selectedCampaigns.length === 1 ? "" : "s"} selecionada
                {selectedCampaigns.length === 1 ? "" : "s"}
              </div>
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
                Leads somados:{" "}
                <strong className="text-foreground">{Math.round(summary.leads)}</strong>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/30 bg-background/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-2xl text-destructive">
                <Trash2 className="size-5" />
                Excluir cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Esta ação remove o cliente, o usuário de acesso e as permissões vinculadas.
              </p>

              {deleteState.error ? (
                <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {deleteState.error}
                </p>
              ) : null}

              {deleteState.success ? (
                <p className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
                  {deleteState.success}
                </p>
              ) : null}

              <form action={deleteAction} className="space-y-3">
                <input type="hidden" name="clientId" value={client.id} />
                <input type="hidden" name="userId" value={linkedUser?.id ?? ""} />
                <input type="hidden" name="authUserId" value={linkedUser?.authUserId ?? ""} />
                <FormPendingButton
                  variant="outline"
                  className="w-full rounded-2xl border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  idleLabel="Excluir cliente"
                  pendingLabel="Excluindo cliente..."
                >
                  Excluir cliente
                </FormPendingButton>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
