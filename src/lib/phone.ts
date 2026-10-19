import { AsYouType, parsePhoneNumberFromString } from "libphonenumber-js";
import {
  formatBrazilianWhatsapp,
  maskBrazilianPhone,
  normalizeBrazilianWhatsapp,
  type PhoneNormalizationResult,
} from "@/lib/ai-agent/shared";

// Telefone de qualquer país, no formato que o WhatsApp usa: código do país +
// número, só dígitos (E.164 sem o "+"). Roda no navegador (máscara) e no
// servidor (validação antes de gravar). As regras por país vêm da
// libphonenumber, a mesma base do Google usada no Android.

const INVALID_INTERNATIONAL =
  "Número inválido. Para outro país, comece com + e o código do país (ex.: +1 415 555 2671).";

export type WhatsappNumberResult =
  | { ok: true; value: string; country: string | null }
  | { ok: false; error: string };

/** "+351..." ou "00351..." indicam o país; sem isso, o Brasil é o padrão. */
function explicitCountry(raw: string) {
  const text = raw.trim();
  return text.startsWith("+") || /^00[1-9]/.test(text.replace(/\D/g, ""));
}

function international(digits: string): WhatsappNumberResult {
  // Número do Brasil com o 55 continua passando pela regra de DDD.
  if (digits.startsWith("55")) {
    const br = normalizeBrazilianWhatsapp(digits);
    if (br.ok) return { ok: true, value: br.value, country: "BR" };
  }
  const parsed = parsePhoneNumberFromString(`+${digits}`);
  if (!parsed || !parsed.isValid())
    return { ok: false, error: INVALID_INTERNATIONAL };
  return {
    ok: true,
    value: parsed.number.replace(/\D/g, ""),
    country: parsed.country ?? null,
  };
}

/**
 * Identifica o país pela forma do número:
 * - com "+" ou "00": usa o código do país informado;
 * - sem código: se for um número brasileiro válido (DDD + número, com ou sem
 *   55), é do Brasil; senão, os primeiros dígitos são lidos como código do
 *   país (ex.: 14155552671 = EUA, 351912345678 = Portugal).
 */
export function normalizeWhatsappNumber(
  raw: string | null | undefined,
): WhatsappNumberResult {
  const text = String(raw ?? "").trim();
  const digits = text.replace(/\D/g, "");
  if (!digits) return { ok: false, error: INVALID_INTERNATIONAL };

  if (explicitCountry(text)) {
    return international(text.startsWith("+") ? digits : digits.slice(2));
  }

  const br: PhoneNormalizationResult = normalizeBrazilianWhatsapp(digits);
  if (br.ok) return { ok: true, value: br.value, country: "BR" };
  // Até 11 dígitos sem código do país: era para ser brasileiro.
  if (digits.length <= 11) {
    const other = international(digits);
    return other.ok ? other : br;
  }
  return international(digits);
}

/** Máscara enquanto digita: brasileiro "(11) 91234-5678", outros "+1 415 555 2671". */
export function maskWhatsappInput(raw: string) {
  const text = raw.trimStart();
  const digits = text.replace(/\D/g, "").slice(0, 15);
  if (!digits) return text.startsWith("+") ? "+" : "";
  if (text.startsWith("+")) return new AsYouType().input(`+${digits}`);
  if (digits.length <= 11) return maskBrazilianPhone(digits);
  if (digits.startsWith("55") && digits.length <= 13)
    return `+55 ${maskBrazilianPhone(digits.slice(2))}`;
  return new AsYouType().input(`+${digits}`);
}

/** Exibição de um número salvo (só dígitos, com código do país). */
export function formatWhatsappNumber(value: string | null | undefined) {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("55") && normalizeBrazilianWhatsapp(digits).ok)
    return `+55 ${formatBrazilianWhatsapp(digits)}`;
  return parsePhoneNumberFromString(`+${digits}`)?.formatInternational() ?? `+${digits}`;
}

/** País detectado, para mostrar ao cliente enquanto digita. */
export function describeWhatsappCountry(raw: string) {
  const result = normalizeWhatsappNumber(raw);
  if (!result.ok || !result.country) return null;
  let name = result.country;
  try {
    name =
      new Intl.DisplayNames(["pt-BR"], { type: "region" }).of(result.country) ??
      result.country;
  } catch {
    // Navegador sem Intl.DisplayNames: fica a sigla do país.
  }
  const code = parsePhoneNumberFromString(`+${result.value}`)?.countryCallingCode;
  return code ? `${name} (+${code})` : name;
}
