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
      description="Estes Termos de Serviço disciplinam o acesso e a utilização do portal privado da Tráfego Academy por administradores, clientes e usuários autorizados."
    >
      <section className="rounded-3xl border border-border/60 bg-card/60 px-5 py-4">
        <p>
          <strong className="text-foreground">Última atualização:</strong> 08/04/2026
        </p>
        <p className="mt-2">
          <strong className="text-foreground">Aplicação:</strong> Portal privado da Tráfego Academy
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">1. Objeto</h2>
        <p className="mt-3">
          O portal é disponibilizado para acompanhamento de campanhas, métricas, permissões,
          relatórios, análises e demais recursos relacionados aos serviços prestados pela Tráfego Academy.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">2. Condições de acesso</h2>
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
          ao acompanhamento de campanhas e informações disponibilizadas para sua conta, respeitando
          os limites de acesso definidos pela administração.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">4. Obrigações do usuário</h2>
        <p className="mt-3">
          O usuário se compromete a manter a confidencialidade de suas credenciais, não compartilhar
          acessos indevidamente, não tentar acessar áreas não autorizadas e não utilizar o portal
          para fins ilícitos, abusivos ou incompatíveis com a finalidade contratada.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">5. Disponibilidade e limitações</h2>
        <p className="mt-3">
          A Tráfego Academy busca manter o portal disponível e atualizado, mas não garante
          disponibilidade ininterrupta, ausência total de falhas ou compatibilidade com
          qualquer ambiente externo de terceiros, especialmente quando dependente de integrações,
          APIs, provedores de hospedagem ou plataformas de mídia.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">6. Propriedade intelectual</h2>
        <p className="mt-3">
          O software, a estrutura, o conteúdo institucional e os materiais disponibilizados no
          portal pertencem à Tráfego Academy ou a seus respectivos titulares, quando aplicável.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">7. Suspensão ou encerramento de acesso</h2>
        <p className="mt-3">
          A Tráfego Academy poderá suspender ou encerrar acessos em caso de uso indevido,
          descumprimento destes termos, encerramento da relação contratual ou necessidade
          operacional devidamente justificada.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">8. Alterações destes termos</h2>
        <p className="mt-3">
          Estes termos podem ser revistos e atualizados a qualquer momento para refletir mudanças
          legais, técnicas, operacionais ou comerciais, passando a vigorar a partir de sua publicação.
        </p>
      </section>
    </LegalPageShell>
  );
}
