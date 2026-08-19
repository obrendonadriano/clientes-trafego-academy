import { Suspense } from "react";
import {
  AdminClientsList,
  type ClientsFilter,
} from "@/components/dashboard/admin-clients-list";
import { ListSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/shell/page-header";
import { getAdminClientsListData } from "@/lib/data/queries";

type AdminClientsRouteProps = {
  searchParams: Promise<{ filtro?: string }>;
};

async function AdminClientsSection({
  searchParams,
}: {
  searchParams: AdminClientsRouteProps["searchParams"];
}) {
  const { filtro } = await searchParams;
  const data = await getAdminClientsListData();
  const filter: ClientsFilter = filtro === "sem-acesso" ? "sem-acesso" : "todos";

  return (
    <AdminClientsList
      clients={data.clients}
      campaigns={data.campaigns}
      permissions={data.permissions}
      clientUsers={data.clientUsers}
      filter={filter}
    />
  );
}

export default function AdminClientsRoute({
  searchParams,
}: AdminClientsRouteProps) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="Área administrativa"
        title="Clientes"
        description="Cadastro das empresas atendidas, o acesso de cada uma ao portal e as campanhas liberadas."
      />

      <Suspense fallback={<ListSkeleton />}>
        <AdminClientsSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
