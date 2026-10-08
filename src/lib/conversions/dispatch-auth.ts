import { timingSafeEqual } from "node:crypto";

// Quem pode drenar a fila de conversões.
//
//   CRON_SECRET      `Authorization: Bearer <CRON_SECRET>`, o formato da
//                    Vercel Cron (não usada no plano Hobby) e do workflow
//                    .github/workflows/conversions-dispatch.yml.
//   SYNC_SECRET_KEY  chamadas manuais e agendadores antigos, por `x-sync-key`
//                    ou pelo mesmo cabeçalho Bearer.
//
// Segredo ausente ou vazio nunca autoriza nada. Sem dependências: os testes
// importam este arquivo direto.

export type DispatchCaller = "cron" | "sync_key";

type SecretEnv = Record<string, string | undefined> & {
  CRON_SECRET?: string;
  SYNC_SECRET_KEY?: string;
};

function sameSecret(received: string, expected: string | undefined) {
  const secret = expected?.trim();

  if (!secret || !received) {
    return false;
  }

  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(secret, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function authorizeDispatch(
  headers: Headers,
  env: SecretEnv = process.env,
): DispatchCaller | null {
  const authorization = headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+/i.test(authorization)
    ? authorization.replace(/^Bearer\s+/i, "").trim()
    : "";

  if (sameSecret(bearer, env.CRON_SECRET)) {
    return "cron";
  }

  // Mesma leitura de antes: `x-sync-key` primeiro; senão o Authorization,
  // com ou sem o prefixo Bearer.
  const syncKey = (
    headers.get("x-sync-key") ?? authorization.replace(/^Bearer\s+/i, "")
  ).trim();

  if (sameSecret(syncKey, env.SYNC_SECRET_KEY)) {
    return "sync_key";
  }

  return null;
}
