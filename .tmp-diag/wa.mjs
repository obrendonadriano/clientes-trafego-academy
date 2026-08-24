// Inspeciona o backend de WhatsApp já existente. Somente leitura.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

console.log("env do projeto:", Object.keys(env).join(", "));

const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

console.log("\n=== whatsapp_sessions ===");
const { data, error } = await db.from("whatsapp_sessions").select("*").limit(5);
if (error) {
  console.log("ERRO:", error.message);
} else {
  console.log("linhas:", data.length);
  if (data.length) console.log("colunas:", Object.keys(data[0]).join(", "));
  else {
    // tabela vazia: valida os nomes de coluna do spec um a um
    for (const col of [
      "client_id",
      "session_name",
      "status",
      "phone_number",
      "push_name",
      "conectado_em",
      "desconectado_em",
      "ultimo_erro",
    ]) {
      const r = await db.from("whatsapp_sessions").select(col).limit(1);
      console.log(`  ${r.error ? "FALTA " : "ok    "} ${col}`);
    }
  }
}

console.log("\n=== valores aceitos em status ===");
for (const v of [
  "NAO_CRIADA",
  "STOPPED",
  "STARTING",
  "SCAN_QR_CODE",
  "WORKING",
  "FAILED",
  "XPTO",
]) {
  const r = await db.from("whatsapp_sessions").select("client_id").eq("status", v).limit(1);
  console.log(`  ${r.error ? "recusado" : "aceito  "} ${v}`);
}

console.log("\n=== join com clients ===");
const j = await db
  .from("whatsapp_sessions")
  .select("client_id, status, clients(nome_empresa)")
  .limit(1);
console.log(j.error ? "FALHOU: " + j.error.message : "join funciona");

console.log("\n=== integration_settings (provedores) ===");
const { data: integ } = await db
  .from("integration_settings")
  .select("provider, enabled, config");
for (const row of integ ?? []) {
  console.log(
    `  ${row.provider} (enabled=${row.enabled}) chaves: ${Object.keys(row.config ?? {}).join(", ") || "(vazio)"}`,
  );
}

console.log("\n=== RPCs de whatsapp ===");
for (const fn of [
  "whatsapp_session_start",
  "whatsapp_get_qr",
  "whatsapp_disconnect",
  "admin_whatsapp_sessions",
]) {
  const r = await db.rpc(fn);
  console.log(`  ${fn}: ${r.error ? r.error.message.slice(0, 90) : "EXISTE"}`);
}
