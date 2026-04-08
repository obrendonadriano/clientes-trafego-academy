import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/legal-page-shell";

export const metadata: Metadata = {
  title: "Política de Privacidade | Tráfego Academy Dashboard",
  description:
    "Política de Privacidade do portal privado da Tráfego Academy.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell
      eyebrow="Documento legal"
      title="Política de Privacidade"
      description="Esta Política de Privacidade explica como a Tráfego Academy coleta, utiliza e protege dados no uso do portal privado de clientes."
    >
      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">1. Dados coletados</h2>
        <p className="mt-3">
          Podemos coletar dados cadastrais, informações de contato, dados de campanhas,
          métricas de mídia paga, histórico de relatórios e informações técnicas necessárias
          para autenticação, segurança e operação do portal.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">2. Finalidade do uso</h2>
        <p className="mt-3">
          Os dados são utilizados para autenticação de usuários, exibição de campanhas e
          métricas permitidas, geração de relatórios, envio de análises por WhatsApp e
          melhoria da experiência operacional entre a Tráfego Academy e seus clientes.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">3. Compartilhamento</h2>
        <p className="mt-3">
          Os dados podem ser tratados por provedores e ferramentas necessários para a
          operação do serviço, como hospedagem, banco de dados, autenticação, integração
          com plataformas de anúncios e serviços de IA, sempre dentro da finalidade do portal.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">4. Segurança</h2>
        <p className="mt-3">
          Adotamos medidas técnicas e organizacionais razoáveis para proteger os dados contra
          acesso não autorizado, alteração indevida, vazamento ou destruição.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">5. Direitos do titular</h2>
        <p className="mt-3">
          O titular pode solicitar informações, correções ou exclusão de dados nos termos da
          legislação aplicável. Solicitações podem ser encaminhadas para o email de contato da empresa.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">6. Contato</h2>
        <p className="mt-3">
          Para dúvidas relacionadas a privacidade e tratamento de dados, entre em contato por:
          <strong className="text-foreground"> contatobrendon@hotmail.com</strong>.
        </p>
      </section>
    </LegalPageShell>
  );
}
