import { Suspense } from "react";
import { ClientCreateForm } from "@/components/admin/client-create-form";
import { FormPageSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/shell/page-header";
import { getAdminClientsListData } from "@/lib/data/queries";

async function NewClientSection() {
  const data = await getAdminClientsListData();

  return <ClientCreateForm campaigns={data.campaigns} />;
}

export default function NewClientRoute() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="Área administrativa"
        title="Novo cliente"
        description="Empresa, acesso ao portal e campanhas liberadas em um único fluxo."
      />

      <Suspense fallback={<FormPageSkeleton />}>
        <NewClientSection />
      </Suspense>
    </div>
  );
}
