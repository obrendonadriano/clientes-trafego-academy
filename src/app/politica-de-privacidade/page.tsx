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
      description="Esta Política de Privacidade estabelece como a Tráfego Academy coleta, utiliza, armazena e protege dados pessoais e informações operacionais tratadas no portal privado de clientes."
    >
      <section className="rounded-3xl border border-border/60 bg-card/60 px-5 py-4">
        <p>
          <strong className="text-foreground">Última atualização:</strong> 08/04/2026
        </p>
        <p className="mt-2">
          <strong className="text-foreground">Controladora:</strong> Tráfego Academy
        </p>
        <p className="mt-2">
          <strong className="text-foreground">Contato:</strong> contatobrendon@hotmail.com
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">1. Escopo desta política</h2>
        <p className="mt-3">
          Esta política se aplica ao uso do portal privado da Tráfego Academy, incluindo áreas
          administrativas, áreas de clientes, relatórios gerados com inteligência artificial,
          integrações com plataformas de mídia e demais recursos vinculados à operação do serviço.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">2. Dados que podem ser tratados</h2>
        <p className="mt-3">
          Dependendo da utilização do portal, a Tráfego Academy poderá tratar dados cadastrais,
          informações de contato, identificadores de usuários, dados de autenticação,
          métricas de campanhas, campanhas vinculadas a clientes, histórico de relatórios,
          registros operacionais e informações técnicas necessárias para segurança, suporte e auditoria.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">3. Finalidades do tratamento</h2>
        <p className="mt-3">
          Os dados tratados são utilizados para autenticação de usuários, controle de acesso,
          visualização de campanhas e métricas autorizadas, emissão de relatórios,
          geração de análises assistidas por IA, acompanhamento operacional e
          comunicação entre a Tráfego Academy e seus clientes.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">4. Compartilhamento com terceiros</h2>
        <p className="mt-3">
          Para a prestação do serviço, determinados dados podem ser processados por fornecedores
          de infraestrutura, autenticação, banco de dados, hospedagem, inteligência artificial
          e plataformas de mídia paga. Esse compartilhamento ocorre de forma compatível com
          as finalidades operacionais do portal e dentro dos limites necessários para a execução do serviço.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">5. Armazenamento e segurança</h2>
        <p className="mt-3">
          A Tráfego Academy adota medidas técnicas e administrativas razoáveis para proteger
          os dados contra acesso não autorizado, perda, divulgação indevida, alteração ou destruição.
          Apesar disso, nenhum sistema é totalmente imune a incidentes, razão pela qual a segurança
          é tratada como processo contínuo de melhoria.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">6. Direitos do titular</h2>
        <p className="mt-3">
          O titular dos dados poderá solicitar, conforme a legislação aplicável, confirmação
          do tratamento, acesso, correção, atualização ou exclusão de informações, sempre
          observadas as bases legais, obrigações regulatórias e requisitos contratuais envolvidos.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">7. Retenção de dados</h2>
        <p className="mt-3">
          Os dados poderão ser mantidos pelo tempo necessário para cumprimento das finalidades
          operacionais, obrigações legais, exercício regular de direitos e manutenção de
          histórico compatível com a prestação dos serviços contratados.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">8. Contato e solicitações</h2>
        <p className="mt-3">
          Dúvidas, solicitações relacionadas a privacidade ou pedidos formais podem ser enviados para
          <strong className="text-foreground"> contatobrendon@hotmail.com</strong>.
        </p>
      </section>
    </LegalPageShell>
  );
}
