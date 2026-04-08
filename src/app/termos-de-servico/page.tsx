import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/legal-page-shell";

export const metadata: Metadata = {
  title: "Termos de Serviço | Tráfego Academy Dashboard",
  description: "Termos de Serviço do portal privado da Tráfego Academy.",
};

export default function TermsOfServicePage() {
  return (
    <LegalPageShell
      eyebrow="Documento legal"
      title="Termos de Serviço"
      description="Estes Termos de Serviço regulam o uso do portal privado da Tráfego Academy por administradores e clientes autorizados."
    >
      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">1. Objeto</h2>
        <p className="mt-3">
          O portal é destinado à visualização de campanhas, métricas, relatórios e análises
          relacionadas aos serviços prestados pela Tráfego Academy aos seus clientes.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">2. Acesso</h2>
        <p className="mt-3">
          O acesso é privado. Não existe cadastro público. Contas são criadas exclusivamente
          pela administração da Tráfego Academy, e cada usuário deve utilizar suas credenciais
          de forma pessoal e intransferível.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">3. Uso permitido</h2>
        <p className="mt-3">
          O usuário concorda em utilizar o portal apenas para finalidades legítimas relacionadas
          ao acompanhamento das campanhas e informações disponibilizadas para sua conta.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">4. Responsabilidades</h2>
        <p className="mt-3">
          A Tráfego Academy busca manter o portal disponível e atualizado, mas não garante
          disponibilidade ininterrupta, ausência total de falhas ou compatibilidade com
          qualquer ambiente externo de terceiros.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">5. Propriedade intelectual</h2>
        <p className="mt-3">
          O software, a estrutura, o conteúdo institucional e os materiais disponibilizados no
          portal pertencem à Tráfego Academy ou a seus respectivos titulares, quando aplicável.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">6. Alterações</h2>
        <p className="mt-3">
          Estes termos podem ser atualizados a qualquer momento para refletir mudanças
          operacionais, técnicas ou legais, passando a valer a partir da publicação da versão atualizada.
        </p>
      </section>
    </LegalPageShell>
  );
}
