"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import {
  listDeepseekModelsAction,
  saveDeepseekModelAction,
  type DeepseekModelSaveState,
  type DeepseekModelsState,
} from "@/app/admin/configuracoes/deepseek-actions";
import { Button } from "@/components/ui/button";
import { FormPendingButton } from "@/components/ui/form-pending-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const OTHER = "__outro__";

/**
 * Troca do modelo do DeepSeek sem digitar a API Key de novo. A lista vem da
 * própria conta do DeepSeek (usando a chave salva no servidor); o modelo é
 * testado antes de salvar.
 */
export function DeepseekModelPicker({ savedModel }: { savedModel: string }) {
  const [list, setList] = useState<DeepseekModelsState>({ current: savedModel });
  const [loading, startLoading] = useTransition();
  const [choice, setChoice] = useState(savedModel);
  const [custom, setCustom] = useState("");
  const [state, action] = useActionState(
    saveDeepseekModelAction,
    {} as DeepseekModelSaveState,
  );

  const load = () =>
    startLoading(async () => {
      const result = await listDeepseekModelsAction();
      setList(result);
    });

  // Carrega a lista ao abrir e de novo depois de salvar (novo "em uso").
  useEffect(() => {
    startLoading(async () => {
      setList(await listDeepseekModelsAction());
    });
  }, [state.success]);

  const current = list.current ?? savedModel;
  const options = [...new Set([current, ...(list.models ?? [])])].filter(Boolean);
  const selected = choice === OTHER ? custom.trim() : choice;

  return (
    <form
      action={action}
      className="mt-4 space-y-3 border-t border-border/60 pt-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">Modelo do Atendimento IA</p>
          <p className="text-xs text-muted-foreground">
            Em uso: <span className="font-mono text-foreground">{current}</span>. Troque
            sem informar a API Key de novo.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={load} disabled={loading}>
          {loading ? (
            <LoaderCircle className="mr-2 size-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 size-4" />
          )}
          Atualizar lista
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="deepseek-model-choice">Modelos da sua conta</Label>
          <select
            id="deepseek-model-choice"
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"
          >
            {options.map((model) => (
              <option key={model} value={model}>
                {model}
                {model === current ? " (em uso)" : ""}
              </option>
            ))}
            <option value={OTHER}>Outro (digitar o nome)</option>
          </select>
        </div>
        {choice === OTHER ? (
          <div className="space-y-1.5">
            <Label htmlFor="deepseek-model-custom">Nome do modelo</Label>
            <Input
              id="deepseek-model-custom"
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              placeholder="ex.: deepseek-chat"
              className="font-mono"
              maxLength={100}
            />
          </div>
        ) : null}
      </div>

      <input type="hidden" name="model" value={selected} />

      {list.error ? <p className="text-xs text-amber-700">{list.error}</p> : null}

      <FormPendingButton
        type="submit"
        variant="outline"
        disabled={!selected || selected === current}
        idleLabel="Testar e salvar modelo"
        pendingLabel="Testando o modelo..."
      />

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="text-sm text-emerald-700">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
