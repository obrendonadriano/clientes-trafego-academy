"use client";

import { useActionState } from "react";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import {
  changeOwnPasswordAction,
  updateOwnProfileAction,
  type ProfileActionState,
} from "@/app/dashboard/perfil/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormPendingButton } from "@/components/ui/form-pending-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { User } from "@/lib/types";

type ClientProfilePageProps = {
  user: User;
  allowedCampaignCount: number;
  totalCampaignCount: number;
};

const initialState: ProfileActionState = {};

function FeedbackMessage({ state }: { state: ProfileActionState }) {
  if (state.error) {
    return (
      <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {state.error}
      </p>
    );
  }

  if (state.success) {
    return (
      <p className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
        {state.success}
      </p>
    );
  }

  return null;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5 text-sm last:border-b-0 dark:border-white/10">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-foreground">{value}</span>
    </div>
  );
}

export function ClientProfilePage({
  user,
  allowedCampaignCount,
  totalCampaignCount,
}: ClientProfilePageProps) {
  const [profileState, saveProfile] = useActionState(
    updateOwnProfileAction,
    initialState,
  );
  const [passwordState, changePassword] = useActionState(
    changeOwnPasswordAction,
    initialState,
  );

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-2 xl:items-start">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Meus dados</CardTitle>
          <p className="text-sm text-muted-foreground">
            Dados de identificação e contato da sua conta.
          </p>
        </CardHeader>
        <CardContent>
          <form action={saveProfile} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="profile_name">Nome</Label>
                <Input id="profile_name" name="name" defaultValue={user.name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile_company">Empresa</Label>
                <Input
                  id="profile_company"
                  value={user.clientName ?? "—"}
                  disabled
                  readOnly
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile_email">E-mail</Label>
                <Input
                  id="profile_email"
                  name="email"
                  type="email"
                  defaultValue={user.email}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile_whatsapp">WhatsApp</Label>
                <Input
                  id="profile_whatsapp"
                  value={user.whatsapp || "—"}
                  disabled
                  readOnly
                />
              </div>
            </div>

            <p className="text-xs leading-5 text-muted-foreground">
              Empresa e WhatsApp só podem ser alterados pela equipe Tráfego Academy.
            </p>

            <FormPendingButton
              className="w-full rounded-full"
              idleLabel="Salvar alterações"
              pendingLabel="Salvando..."
            />

            <FeedbackMessage state={profileState} />
          </form>
        </CardContent>
      </Card>

      <div className="flex min-w-0 flex-col gap-6">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Senha</CardTitle>
            <p className="text-sm text-muted-foreground">
              Mínimo de 8 caracteres.
            </p>
          </CardHeader>
          <CardContent>
            <form action={changePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new_password">Nova senha</Label>
                <Input
                  id="new_password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm_password">Confirmar nova senha</Label>
                <Input
                  id="confirm_password"
                  name="confirmation"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              </div>

              <FormPendingButton
                variant="outline"
                className="w-full rounded-full"
                idleLabel="Alterar senha"
                pendingLabel="Alterando..."
              />

              <FeedbackMessage state={passwordState} />
            </form>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Acesso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-border/60 dark:border-white/10">
              <InfoRow label="Usuário" value={user.username} />
              <InfoRow
                label="Campanhas liberadas"
                value={`${allowedCampaignCount} de ${totalCampaignCount}`}
              />
              <InfoRow
                label="Situação"
                value={user.active ? "Ativo" : "Inativo"}
              />
            </div>

            <form action={logoutAction}>
              <FormPendingButton
                variant="outline"
                className="w-full gap-2 rounded-full"
                idleLabel="Sair da conta"
                pendingLabel="Saindo..."
              >
                <LogOut className="size-4 shrink-0" />
                <span>Sair da conta</span>
              </FormPendingButton>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
