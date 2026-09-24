import { redirect } from "next/navigation";
import { MetaReviewTool } from "@/components/admin/meta-review-tool";
import { PageHeader } from "@/components/shell/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { getReviewConfigStatus } from "@/lib/meta/review-tools";

// FERRAMENTA TEMPORÁRIA de App Review da Meta.
//
// Isolada de propósito: não importa nada de Conversões, Dataset, CAPI,
// Embedded Signup, WAHA ou Atendimento por IA, e não escreve no banco.
//
// O layout de /admin já exige sessão e papel de administrador; a verificação
// aqui é a segunda barreira, e cada server action verifica de novo — elas são
// endpoints HTTP e podem ser chamadas fora da tela.

export const dynamic = "force-dynamic";

export default async function MetaReviewRoute() {
  // Sem sessão, getCurrentUser já redireciona para o login.
  const user = await getCurrentUser();

  if (user.role !== "admin" || !user.active) {
    redirect("/dashboard");
  }

  // Só os indicadores de "configurado ou não" atravessam para o navegador.
  const config = getReviewConfigStatus();

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="Área administrativa"
        title="Meta App Review — Ferramenta de demonstração"
        description="Executa chamadas reais às APIs oficiais da Meta com os ativos de teste, para gravar as evidências exigidas no App Review."
      />

      <MetaReviewTool config={config} />
    </div>
  );
}
