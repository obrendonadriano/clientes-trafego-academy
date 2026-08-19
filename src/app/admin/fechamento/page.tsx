import { Suspense } from "react";
import { ClosingPage } from "@/components/dashboard/closing-page";
import { FormPageSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/shell/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { getClosingData } from "@/lib/data/closing";
import {
  DEFAULT_CLOSING_PRESET,
  resolveClosingWindow,
} from "@/lib/data/closing-window";

type ClosingRouteProps = {
  searchParams: Promise<{
    preset?: string;
    inicio?: string;
    fim?: string;
    cliente?: string;
  }>;
};

async function ClosingSection({
  searchParams,
}: {
  searchParams: ClosingRouteProps["searchParams"];
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const window = resolveClosingWindow(user.role, params);
  const data = await getClosingData(
    user,
    window,
    user.role === "admin" ? params.cliente : null,
  );

  return (
    <ClosingPage
      data={data}
      activePreset={params.preset ?? DEFAULT_CLOSING_PRESET}
    />
  );
}

export default function ClosingRoute({ searchParams }: ClosingRouteProps) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="Área administrativa"
        title="Fechamento"
        description="Total investido no período com os impostos da Meta, pronto para cobrança e para baixar em PDF."
      />

      <Suspense fallback={<FormPageSkeleton />}>
        <ClosingSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
