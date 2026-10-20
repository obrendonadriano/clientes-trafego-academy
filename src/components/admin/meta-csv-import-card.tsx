"use client";

import { useRef, useState } from "react";
import { LoaderCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ExportClientOption } from "./leads-export-panel";

type ImportResult = {
  inserted: number;
  skipped: number;
  rejected: number;
  rejectedSample?: { line: number; reason: string }[];
  questions?: string[];
};

/**
 * Importa o CSV de leads de formulário baixado do Gerenciador de Anúncios
 * (UTF-16, TAB). Lead já importado não duplica. Os leads entram na exportação
 * com a origem "Formulário Meta".
 */
export function MetaCsvImportCard({ clients }: { clients: ExportClientOption[] }) {
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    const file = fileRef.current?.files?.[0];
    if (!clientId) return setError("Escolha de qual cliente são os leads.");
    if (!file) return setError("Escolha o arquivo CSV.");

    const body = new FormData();
    body.set("clientId", clientId);
    body.set("file", file);

    setBusy(true);
    try {
      const response = await fetch("/api/admin/meta-form-leads/import", { method: "POST", body });
      const payload = (await response.json().catch(() => ({}))) as ImportResult & { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Não foi possível importar o arquivo.");
        return;
      }
      setResult(payload);
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      setError("Sem conexão. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-xl">Importar CSV de leads da Meta</CardTitle>
        <p className="text-sm text-muted-foreground">
          Arquivo baixado do Gerenciador de Anúncios (formulário instantâneo).
          Leads já importados não são duplicados.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="import-client">Cliente</Label>
              <select
                id="import-client"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"
              >
                <option value="">Escolha o cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="import-file">Arquivo (.csv)</Label>
              <input
                id="import-file"
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,text/csv,text/tab-separated-values"
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-card file:px-3 file:py-1.5"
              />
            </div>
          </div>
          <Button type="submit" variant="outline" disabled={busy}>
            {busy ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
            {busy ? "Importando..." : "Importar CSV"}
          </Button>
        </form>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {result ? (
          <div role="status" className="mt-3 space-y-1 rounded-2xl border border-border/60 p-3 text-sm">
            <p className={cn(result.inserted > 0 ? "text-emerald-700" : "text-foreground")}>
              {result.inserted} lead(s) importado(s); {result.skipped} já existia(m) e não foram duplicados.
            </p>
            {result.rejected > 0 ? (
              <p className="text-amber-700">
                {result.rejected} linha(s) ignorada(s):{" "}
                {result.rejectedSample?.map((item) => `linha ${item.line} (${item.reason})`).join(", ")}
              </p>
            ) : null}
            {result.questions?.length ? (
              <p className="text-xs text-muted-foreground">
                Perguntas lidas: {result.questions.join(" · ")}
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
