import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { CLIENT_MAX_RANGE_DAYS } from "@/lib/data/date-range";
import { getAppShellData } from "@/lib/data/queries";
import type { User } from "@/lib/types";

// Busca os dados da moldura no servidor e entrega ao shell (client component).
export async function AppShellContainer({
  user,
  children,
}: {
  user: User;
  children: ReactNode;
}) {
  const { clients, campaigns, syncStatus, whatsappSession } =
    await getAppShellData(user);

  const searchEntries = [
    ...clients.map((client) => ({
      id: client.id,
      label: client.name,
      detail: "Cliente",
      kind: "cliente" as const,
      href: `/admin/clientes/${client.id}`,
    })),
    ...campaigns.map((campaign) => ({
      id: campaign.id,
      label: campaign.name,
      detail: campaign.clientName ? `Campanha · ${campaign.clientName}` : "Campanha",
      kind: "campanha" as const,
      href: `/admin/campanhas?campanha=${encodeURIComponent(campaign.id)}`,
    })),
  ];

  return (
    <AppShell
      user={user}
      clients={clients}
      searchEntries={searchEntries}
      syncStatus={syncStatus}
      whatsappSession={whatsappSession}
      maxRangeDays={user.role === "client" ? CLIENT_MAX_RANGE_DAYS : undefined}
      maxRangeLabel={user.role === "client" ? "3 meses" : undefined}
    >
      {children}
    </AppShell>
  );
}
