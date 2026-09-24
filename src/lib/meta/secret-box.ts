import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// Tokens de clientes nunca ficam em claro no banco. A chave vive só no
// ambiente do servidor; o schema `private` é a segunda barreira, não a única.
//
// Formato: v1.<iv base64url>.<tag base64url>.<cifra base64url>
// O prefixo existe para reconhecer um token legado em texto puro, gravado pelo
// fluxo manual antigo, e continuar aceitando-o até o cliente reconectar.

const PREFIX = "v1";
const IV_BYTES = 12;

function readKey() {
  const raw = process.env.META_CREDENTIALS_KEY?.trim();

  if (!raw) {
    throw new Error(
      "META_CREDENTIALS_KEY não configurada: sem ela não é possível guardar credenciais da Meta com segurança.",
    );
  }

  const key = Buffer.from(raw, "base64");

  if (key.length !== 32) {
    throw new Error(
      "META_CREDENTIALS_KEY precisa ser 32 bytes em base64 (openssl rand -base64 32).",
    );
  }

  return key;
}

export function isSecretBoxConfigured() {
  try {
    readKey();
    return true;
  } catch {
    return false;
  }
}

export function sealSecret(plaintext: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", readKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return [
    PREFIX,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function isSealed(value: string) {
  return value.startsWith(`${PREFIX}.`) && value.split(".").length === 4;
}

export function openSecret(value: string) {
  if (!isSealed(value)) {
    // Credencial do cadastro manual antigo. Continua válida até o cliente
    // passar pelo Embedded Signup, quando a nova é gravada já cifrada.
    return value;
  }

  const [, iv, tag, payload] = value.split(".");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    readKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(payload, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

// Comparação de assinatura em tempo constante, tolerante a tamanhos diferentes.
export function safeEqualHex(received: string, expected: string) {
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}
