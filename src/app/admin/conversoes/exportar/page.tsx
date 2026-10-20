import { redirect } from "next/navigation";

// A exportação de leads mudou para Configurações. Mantém o endereço antigo
// funcionando (favoritos, links já enviados).
export default function LegacyLeadsExportRoute() {
  redirect("/admin/configuracoes/exportar");
}
