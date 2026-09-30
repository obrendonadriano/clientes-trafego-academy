import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
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
      <Link
        href="/admin/clientes"
        className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition hover:text-brand-600"
      >
        <ArrowLeft className="size-4" strokeWidth={1.75} />
        Voltar para clientes
      </Link>
      <PageHeader
        title="Novo cliente"
        description="Empresa, acesso ao portal e campanhas liberadas em um único fluxo."
      />

      <Suspense fallback={<FormPageSkeleton />}>
        <NewClientSection />
      </Suspense>
    </div>
  );
}
