import { Suspense } from "react";
import { ClientProfilePage } from "@/components/dashboard/client-profile-page";
import { FormPageSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/shell/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { getDefaultMetricsWindow } from "@/lib/data/date-range";
import { getAppShellData, getClientPortalData } from "@/lib/data/queries";
import { getClientPlanType } from "@/lib/ai-agent/store";
import { isSupabaseAdminConfigured } from "@/lib/env";
import type { User } from "@/lib/types";

async function ProfileSection({ user }: { user: User }) {
  // Plano contratado de verdade (antes vinha do acesso à IA e aparecia
  // "Completo" para o Essencial com a IA liberada). Falha: mostra "—".
  const [portal, shell, planType] = await Promise.all([
    getClientPortalData(user, getDefaultMetricsWindow()),
    getAppShellData(user),
    user.clientId && isSupabaseAdminConfigured()
      ? getClientPlanType(user.clientId).catch(() => null)
      : Promise.resolve(null),
  ]);

  return (
    <ClientProfilePage
      user={user}
      allowedCampaignCount={portal.campaigns.length}
      totalCampaignCount={Math.max(
        portal.campaigns.length,
        shell.campaigns.length,
      )}
      planType={planType}
    />
  );
}

export default async function ClientProfileRoute() {
  const user = await getCurrentUser();

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="Área do cliente"
        title="Meu perfil"
        description="Seus dados de contato, a senha de acesso e o resumo da conta."
      />

      <Suspense fallback={<FormPageSkeleton />}>
        <ProfileSection user={user} />
      </Suspense>
    </div>
  );
}
