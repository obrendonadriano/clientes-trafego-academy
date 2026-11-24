"use server";

import { revalidatePath } from "next/cache";
import { expireTag } from "@/lib/cache/expire-tag";
import { z } from "zod";
import { applyOwnProfileUpdate } from "@/lib/auth/own-profile";
import { getOptionalCurrentUser } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ProfileActionState = {
  success?: string;
  error?: string;
};

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

  const result = await applyOwnProfileUpdate(user, {
    name: formData.get("name"),
    email: formData.get("email"),
  });

  if (result.error) {
    return { error: result.error };
  }

  expireTag("users");
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
