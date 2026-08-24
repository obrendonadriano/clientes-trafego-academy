import { ExternalLink, Info } from "lucide-react";

const META_WHATSAPP_ACCOUNTS_URL =
  "https://business.facebook.com/settings/whatsapp-business-accounts";

export function WabaHelp({ creationFlow = false }: { creationFlow?: boolean }) {
  return (
    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-foreground">
      <div className="flex items-start gap-2.5">
        <Info
          className="mt-1 size-4 shrink-0 text-amber-600 dark:text-amber-300"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p>
            <span className="font-medium">O WABA ID não vem do WAHA.</span>{" "}
            O WAHA conhece apenas a sessão e o número conectado. O WABA é o ID
            da conta oficial do WhatsApp dentro da Meta e é exigido para
            atribuir uma conversão de anúncio que abriu o WhatsApp.
          </p>

          {creationFlow ? (
            <p className="mt-2 text-muted-foreground">
              Você pode criar o cliente sem preencher isso e configurar a CAPI
              depois, no perfil dele.
            </p>
          ) : null}

          <details className="mt-2">
            <summary className="cursor-pointer font-medium text-primary underline-offset-4 hover:underline">
              Onde encontrar ou criar o WABA ID
            </summary>
            <div className="mt-2 space-y-2 text-muted-foreground">
              <p>
                Abra o portfólio correto do cliente na Meta e acesse
                Configurações do negócio → Contas → Contas do WhatsApp.
                Selecione a conta e copie o ID numérico exibido nos detalhes.
              </p>
              <p>
                Se nenhuma conta aparecer, o número ainda precisa ser
                conectado à plataforma oficial do WhatsApp Business da Meta.
                Conectar o mesmo número ao WAHA não cria esse ativo.
              </p>
              <a
                href={META_WHATSAPP_ACCOUNTS_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
              >
                Abrir Contas do WhatsApp na Meta
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
