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
      description="Se você deseja solicitar exclusão de dados relacionados ao portal privado da Tráfego Academy, siga as instruções abaixo."
    >
      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">Como solicitar</h2>
        <p className="mt-3">
          Envie uma solicitação para <strong className="text-foreground">contatobrendon@hotmail.com</strong>,
          informando no assunto <strong className="text-foreground">Solicitação de exclusão de dados</strong>.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">Informações recomendadas</h2>
        <p className="mt-3">
          Para agilizar o atendimento, informe seu nome, empresa vinculada, email de acesso
          utilizado no portal e uma descrição clara do pedido.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-foreground">Prazo e validação</h2>
        <p className="mt-3">
          A solicitação poderá passar por validação de identidade e será analisada em prazo
          razoável, observadas as obrigações legais, contratuais e regulatórias aplicáveis.
        </p>
      </section>
    </LegalPageShell>
  );
}
