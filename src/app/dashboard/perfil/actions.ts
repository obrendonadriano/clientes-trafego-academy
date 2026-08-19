"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { getOptionalCurrentUser } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ProfileActionState = {
  success?: string;
  error?: string;
};

const profileSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome completo."),
  email: z.string().email("Informe um e-mail válido."),
});

const passwordSchema = z
  .object({
    password: z.string().min(8, "A nova senha precisa de ao menos 8 caracteres."),
    confirmation: z.string(),
  })
  .refine((data) => data.password === data.confirmation, {
    message: "A confirmação não confere com a nova senha.",
    path: ["confirmation"],
  });

// O cliente pode alterar somente nome e e-mail. Empresa e WhatsApp ficam sob
// controle administrativo, inclusive contra chamadas diretas desta action.
export async function updateOwnProfileAction(
  prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  void prevState;

  const user = await getOptionalCurrentUser();

  if (!user) {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });

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

  if (error) {
    return { error: error.message };
  }

  updateTag("users");
  revalidatePath("/dashboard/perfil");
  return { success: "Dados atualizados." };
}

export async function changeOwnPasswordAction(
  prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  void prevState;

  const user = await getOptionalCurrentUser();

  if (!user) {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  if (!user.authUserId) {
    return {
      error: "Esta conta não tem login próprio. Fale com a equipe para ajustar.",
    };
  }

  const parsed = passwordSchema.safeParse({
    password: formData.get("password"),
    confirmation: formData.get("confirmation"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return { error: "Supabase não configurado." };
  }

  const { error } = await adminClient.auth.admin.updateUserById(user.authUserId, {
    password: parsed.data.password,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: "Senha alterada." };
}
