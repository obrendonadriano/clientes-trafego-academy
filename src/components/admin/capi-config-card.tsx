"use client";

import { useActionState, useState } from "react";
import { CircleCheck, CircleSlash, KeyRound } from "lucide-react";
import {
  clearCapiTokenAction,
  saveCapiConfigAction,
  type CapiConfigState,
} from "@/app/admin/conversoes/capi-actions";
import { Field } from "@/components/admin/client-form-fields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormPendingButton } from "@/components/ui/form-pending-button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export type CapiConfig = {
  clientId: string;
  datasetId: string;
  wabaId: string;
  capiAtivo: boolean;
  tokenConfigurado: boolean;
};

const initialState: CapiConfigState = {};

function Feedback({ state }: { state: CapiConfigState }) {
  if (state.error) {
    return (
      <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {state.error}
      </p>
    );
  }

  if (state.success) {
    return (
      <p className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
        {state.success}
      </p>
    );
  }

  return null;
}

export function CapiConfigCard({ config }: { config: CapiConfig }) {
  const [saveState, save] = useActionState(saveCapiConfigAction, initialState);
  const [clearState, clear] = useActionState(clearCapiTokenAction, initialState);

  const [datasetId, setDatasetId] = useState(config.datasetId);
  const [wabaId, setWabaId] = useState(config.wabaId);
  const [token, setToken] = useState("");
  const [ativo, setAtivo] = useState(config.capiAtivo);

  // Só dá para ligar o envio quando os três dados existem. O token pode já
  // estar guardado de antes — daí não precisa digitar de novo.
  const temToken = config.tokenConfigurado || token.trim().length > 0;
  const podeAtivar =
    datasetId.trim().length > 0 && wabaId.trim().length > 0 && temToken;

  return (
    <Card className="min-w-0 border-border/60 bg-background/60">
      <CardHeader>
        <CardTitle className="font-display text-2xl">
          Integração Meta (Conversions API)
        </CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          Com isso ligado, os leads marcados como qualificados são enviados ao
          Meta para o algoritmo aprender a buscar pessoas parecidas.
        </p>
      </CardHeader>

      <CardContent className="min-w-0 space-y-4">
        <form action={save} className="space-y-4">
          <input type="hidden" name="clientId" value={config.clientId} />

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="ID do Dataset (Gerenciador de Eventos)" htmlFor="capi_dataset">
              <Input
                id="capi_dataset"
                name="datasetId"
                value={datasetId}
                onChange={(event) => setDatasetId(event.target.value)}
                placeholder="123456789012345"
                inputMode="numeric"
              />
              <p className="text-xs leading-5 text-muted-foreground">
                Encontre em Gerenciador de Eventos → Configurações. É o mesmo ID
                que antes se chamava Pixel.
              </p>
            </Field>

            <Field label="WABA ID (conta do WhatsApp Business)" htmlFor="capi_waba">
              <Input
                id="capi_waba"
                name="wabaId"
                value={wabaId}
                onChange={(event) => setWabaId(event.target.value)}
                placeholder="987654321098765"
                inputMode="numeric"
              />
              <p className="text-xs leading-5 text-muted-foreground">
                ID da conta do WhatsApp Business vinculada ao Dataset deste cliente.
              </p>
            </Field>
          </div>

          <Field label="Token de acesso" htmlFor="capi_token">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Input
                id="capi_token"
                name="accessToken"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder={
                  config.tokenConfigurado
                    ? "Preencha apenas para substituir"
                    : "Cole o token de acesso da Meta"
                }
                className="min-w-0 flex-1"
              />

              {config.tokenConfigurado ? (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  <CircleCheck className="size-3.5" />
                  Token configurado — preencha apenas para substituir
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border/70 px-3 py-1.5 text-xs text-muted-foreground dark:border-white/10">
                  <KeyRound className="size-3.5" />
                  Não configurado
                </span>
              )}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Por segurança o token nunca é exibido de volta: ele fica guardado
              fora do alcance da interface.
            </p>
          </Field>

          {/* O Switch já traz o próprio <label>, então aqui vai uma div:
              aninhar labels quebraria o clique no interruptor. */}
          <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3">
            <Switch
              name="capiAtivo"
              checked={ativo}
              disabled={!podeAtivar}
              onChange={(event) => setAtivo(event.target.checked)}
            />
            <span className="text-sm text-foreground">
              <span className="block font-medium">
                Enviar conversões para o Meta
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {podeAtivar
                  ? "Os leads qualificados entram na fila de envio."
                  : "Preencha Dataset, WABA ID e Token para poder ativar."}
              </span>
            </span>
          </div>

          <div className="flex flex-wrap gap-3">
            <FormPendingButton
              className="rounded-full"
              idleLabel="Salvar integração"
              pendingLabel="Salvando..."
            />
          </div>

          <Feedback state={saveState} />
        </form>

        {config.tokenConfigurado ? (
          <form action={clear} className="border-t border-border/60 pt-4 dark:border-white/10">
            <input type="hidden" name="clientId" value={config.clientId} />
            <FormPendingButton
              variant="outline"
              className="gap-2 rounded-full"
              idleLabel="Remover token"
              pendingLabel="Removendo..."
            >
              <CircleSlash className="size-4 shrink-0" />
              <span>Remover token</span>
            </FormPendingButton>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Remover o token também desliga o envio de conversões deste cliente.
            </p>

            <Feedback state={clearState} />
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
