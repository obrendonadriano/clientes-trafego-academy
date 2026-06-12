import { z } from "zod";

// Schemas compartilhados entre os formulários (client) e as server actions
// (server revalida sempre — nunca confiar só no front).

export const usernameField = z
  .string()
  .min(3, "O usuário precisa de ao menos 3 caracteres.")
  .regex(
    /^[a-z0-9._-]+$/,
    "Use apenas letras minúsculas, números, ponto, hífen ou underline.",
  );

export const whatsappField = z
  .string()
  .min(8, "Informe o WhatsApp com DDD.")
  .regex(/^[+0-9()\s-]+$/, "O WhatsApp deve conter apenas números, +, ( ) e -.");

export const clientWorkspaceSchema = z.object({
  companyName: z.string().min(2, "Informe o nome da empresa."),
  contactName: z.string().min(2, "Informe o responsável."),
  whatsapp: whatsappField,
  notes: z.string().optional(),
  accountName: z.string().min(2, "Informe o nome do acesso."),
  username: usernameField,
  email: z.string().email("Informe um email válido."),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres."),
});

export const updateClientWorkspaceSchema = z.object({
  clientId: z.string().uuid("Cliente inválido."),
  userId: z.string().uuid().optional().or(z.literal("")),
  authUserId: z.string().uuid().optional().or(z.literal("")),
  companyName: z.string().min(2, "Informe o nome da empresa."),
  contactName: z.string().min(2, "Informe o responsável."),
  whatsapp: whatsappField,
  notes: z.string().optional(),
  clientActive: z.string().optional(),
  accountName: z.string().min(2, "Informe o nome do acesso."),
  username: usernameField,
  email: z.string().email("Informe um email válido."),
  password: z.string().optional(),
  accessActive: z.string().optional(),
});

export type ClientWorkspaceInput = z.infer<typeof clientWorkspaceSchema>;

// Converte os issues do zod em erros por campo para exibição inline.
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");

    if (field && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }

  return fieldErrors;
}
