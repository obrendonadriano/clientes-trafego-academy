import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/legal-page-shell";

export const metadata: Metadata = {
  title: "Exclusão de Dados | Tráfego Academy Dashboard",
  description:
    "Instruções para solicitar exclusão de dados no portal da Tráfego Academy.",
};

export default function DataDeletionPage() {
  return (
    <LegalPageShell
      eyebrow="Suporte de dados"
      title="Exclusão de Dados"
      description="Esta página apresenta o procedimento para solicitação de exclusão de dados relacionados ao portal privado da Tráfego Academy."
    >
      <section className="rounded-3xl border border-border/60 bg-card/60 px-5 py-4">
        <p>
          <strong className="text-foreground">Canal oficial:</strong> contatobrendon@hotmail.com
        </p>
        <p className="mt-2">
          <strong className="text-foreground">Assunto recomendado:</strong> Solicitação de exclusão de dados
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">1. Como solicitar</h2>
        <p className="mt-3">
          Envie uma solicitação para <strong className="text-foreground">contatobrendon@hotmail.com</strong>,
          informando no assunto <strong className="text-foreground">Solicitação de exclusão de dados</strong>.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">2. Informações recomendadas</h2>
        <p className="mt-3">
          Para agilizar o atendimento, informe seu nome, empresa vinculada, email de acesso
          utilizado no portal e uma descrição clara do pedido.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">3. Validação da solicitação</h2>
        <p className="mt-3">
          A solicitação poderá passar por processo de validação de identidade para proteção
          do titular e prevenção de exclusões indevidas ou fraudulentas.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">4. Análise e retenção legal</h2>
        <p className="mt-3">
          O pedido será analisado em prazo razoável, considerando obrigações legais,
          regulatórias, contratuais e necessidades legítimas de retenção aplicáveis ao caso.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">5. Confirmação de atendimento</h2>
        <p className="mt-3">
          Após a conclusão da análise, a Tráfego Academy poderá responder pelo mesmo canal
          utilizado no pedido com informações sobre a execução, limitação ou impossibilidade
          jurídica da exclusão solicitada.
        </p>
      </section>
    </LegalPageShell>
  );
}
