import Link from "next/link";
import { Suspense } from "react";
import { UserPlus } from "lucide-react";
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
  const filter: ClientsFilter =
    filtro === "ativos" || filtro === "inativos"
      ? filtro
      : "todos";

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
        title="Clientes"
        description="Cadastro das empresas atendidas, o acesso de cada uma ao portal e as campanhas liberadas."
        actions={
          <Link
            href="/admin/clientes/novo"
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[linear-gradient(180deg,var(--brand-500),var(--brand-600))] px-4 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(16,24,40,0.1),inset_0_1px_0_rgba(255,255,255,0.15)] transition-all duration-200 hover:shadow-[0_8px_20px_-8px_rgba(106,69,232,0.6)] hover:brightness-[1.07]"
          >
            <UserPlus className="size-4" strokeWidth={2} />
            Novo cliente
          </Link>
        }
      />

      <Suspense fallback={<ListSkeleton />}>
        <AdminClientsSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
