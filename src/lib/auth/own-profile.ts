import "server-only";

import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { User } from "@/lib/types";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome completo."),
  email: z.string().email("Informe um e-mail válido."),
});

// Regra única da edição do próprio perfil (site e app). O cliente altera só
// nome e e-mail; empresa e WhatsApp ficam sob controle administrativo. A
// invalidação de cache fica com quem chama, pois difere entre action e rota.
export async function applyOwnProfileUpdate(
  user: User,
  input: { name: unknown; email: unknown },
): Promise<{ error?: string }> {
  const parsed = profileSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return { error: "Supabase não configurado." };
  }

  // E-mail duplicado em outra conta bloqueia a troca.
  const { data: duplicate } = await adminClient
    .from("users")
    .select("id")
    .eq("email", parsed.data.email)
    .neq("id", user.id)
    .maybeSingle<{ id: string }>();

  if (duplicate) {
    return { error: "Este e-mail já está em uso por outra conta." };
  }

  if (user.authUserId) {
    const authUpdate = await adminClient.auth.admin.updateUserById(
      user.authUserId,
      {
        email: parsed.data.email,
        user_metadata: { nome: parsed.data.name },
      },
    );

    if (authUpdate.error) {
      return { error: authUpdate.error.message };
    }
  }

  const { error } = await adminClient
    .from("users")
    .update({
      nome: parsed.data.name,
      email: parsed.data.email,
    })
    .eq("id", user.id);

  return error ? { error: error.message } : {};
}
