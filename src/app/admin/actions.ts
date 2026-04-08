"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type AdminActionState = {
  success?: string;
  error?: string;
};

const clientSchema = z.object({
  companyName: z.string().min(2, "Informe o nome da empresa."),
  contactName: z.string().min(2, "Informe o responsável."),
  whatsapp: z.string().min(8, "Informe o WhatsApp."),
  notes: z.string().optional(),
});

const campaignSchema = z.object({
  name: z.string().min(2, "Informe o nome da campanha."),
  status: z.string().min(2, "Informe o status."),
  platform: z.string().min(2, "Informe a plataforma."),
  clientId: z.string().uuid("Selecione um cliente válido."),
});

const accountSchema = z.object({
  name: z.string().min(2, "Informe o nome do usuário."),
  username: z.string().min(3, "Informe um username."),
  email: z.string().email("Informe um email válido."),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres."),
  whatsapp: z.string().min(8, "Informe o WhatsApp."),
  clientId: z.string().uuid("Selecione um cliente válido."),
});

const permissionSchema = z.object({
  userId: z.string().uuid("Selecione um usuário válido."),
  campaignId: z.string().uuid("Selecione uma campanha válida."),
});

const clientWorkspaceSchema = z.object({
  companyName: z.string().min(2, "Informe o nome da empresa."),
  contactName: z.string().min(2, "Informe o responsável."),
  whatsapp: z.string().min(8, "Informe o WhatsApp."),
  notes: z.string().optional(),
  accountName: z.string().min(2, "Informe o nome do acesso."),
  username: z.string().min(3, "Informe um username."),
  email: z.string().email("Informe um email válido."),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres."),
});

const updateClientWorkspaceSchema = z.object({
  clientId: z.string().uuid("Cliente inválido."),
  userId: z.string().uuid().optional().or(z.literal("")),
  authUserId: z.string().uuid().optional().or(z.literal("")),
  companyName: z.string().min(2, "Informe o nome da empresa."),
  contactName: z.string().min(2, "Informe o responsável."),
  whatsapp: z.string().min(8, "Informe o WhatsApp."),
  notes: z.string().optional(),
  clientActive: z.string().optional(),
  accountName: z.string().min(2, "Informe o nome do acesso."),
  username: z.string().min(3, "Informe um username."),
  email: z.string().email("Informe um email válido."),
  password: z.string().optional(),
  accessActive: z.string().optional(),
});

function guardSupabase() {
  if (!isSupabaseConfigured()) {
    return {
      error:
        "Configure NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY para habilitar o CRUD real.",
    } satisfies AdminActionState;
  }

  return null;
}

export async function createClientAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const guarded = guardSupabase();
  if (guarded) return guarded;

  const parsed = clientSchema.safeParse({
    companyName: formData.get("companyName"),
    contactName: formData.get("contactName"),
    whatsapp: formData.get("whatsapp"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  const adminClient = createSupabaseAdminClient()!;
  const { error } = await adminClient.from("clients").insert({
    nome_empresa: parsed.data.companyName,
    responsavel: parsed.data.contactName,
    whatsapp: parsed.data.whatsapp,
    observacoes: parsed.data.notes || null,
    ativo: true,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin");
  return { success: "Cliente criado com sucesso." };
}

export async function createClientWorkspaceAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const guarded = guardSupabase();
  if (guarded) return guarded;

  const parsed = clientWorkspaceSchema.safeParse({
    companyName: formData.get("companyName"),
    contactName: formData.get("contactName"),
    whatsapp: formData.get("whatsapp"),
    notes: formData.get("notes"),
    accountName: formData.get("accountName"),
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  const campaignIds = formData
    .getAll("campaignIds")
    .map((value) => String(value))
    .filter(Boolean);

  const adminClient = createSupabaseAdminClient()!;

  const clientInsert = await adminClient
    .from("clients")
    .insert({
      nome_empresa: parsed.data.companyName,
      responsavel: parsed.data.contactName,
      whatsapp: parsed.data.whatsapp,
      observacoes: parsed.data.notes || null,
      ativo: true,
    })
    .select("id")
    .single();

  if (clientInsert.error || !clientInsert.data) {
    return { error: clientInsert.error?.message ?? "Falha ao criar cliente." };
  }

  const authResult = await adminClient.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });

  if (authResult.error || !authResult.data.user) {
    await adminClient.from("clients").delete().eq("id", clientInsert.data.id);
    return { error: authResult.error?.message ?? "Falha ao criar usuário auth." };
  }

  const userInsert = await adminClient
    .from("users")
    .insert({
      auth_user_id: authResult.data.user.id,
      nome: parsed.data.accountName,
      username: parsed.data.username,
      email: parsed.data.email,
      role: "client",
      whatsapp: parsed.data.whatsapp,
      ativo: true,
      client_id: clientInsert.data.id,
    })
    .select("id")
    .single();

  if (userInsert.error || !userInsert.data) {
    await adminClient.auth.admin.deleteUser(authResult.data.user.id);
    await adminClient.from("clients").delete().eq("id", clientInsert.data.id);
    return { error: userInsert.error?.message ?? "Falha ao registrar perfil do cliente." };
  }

  if (campaignIds.length > 0) {
    const permissionInsert = await adminClient.from("user_campaign_permissions").insert(
      campaignIds.map((campaignId) => ({
        user_id: userInsert.data.id,
        campaign_id: campaignId,
      })),
    );

    if (permissionInsert.error) {
      return { error: permissionInsert.error.message };
    }
  }

  revalidatePath("/admin");
  return { success: "Cliente criado com acesso ao portal configurado." };
}

export async function createCampaignAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const guarded = guardSupabase();
  if (guarded) return guarded;

  const parsed = campaignSchema.safeParse({
    name: formData.get("name"),
    status: formData.get("status"),
    platform: formData.get("platform"),
    clientId: formData.get("clientId"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  const adminClient = createSupabaseAdminClient()!;
  const { error } = await adminClient.from("campaigns").insert({
    nome: parsed.data.name,
    status: parsed.data.status,
    plataforma: parsed.data.platform,
    client_id: parsed.data.clientId,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin");
  return { success: "Campanha criada com sucesso." };
}

export async function updateClientWorkspaceAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const guarded = guardSupabase();
  if (guarded) return guarded;

  const parsed = updateClientWorkspaceSchema.safeParse({
    clientId: formData.get("clientId"),
    userId: formData.get("userId"),
    authUserId: formData.get("authUserId"),
    companyName: formData.get("companyName"),
    contactName: formData.get("contactName"),
    whatsapp: formData.get("whatsapp"),
    notes: formData.get("notes"),
    clientActive: formData.get("clientActive"),
    accountName: formData.get("accountName"),
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
    accessActive: formData.get("accessActive"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  const campaignIds = formData
    .getAll("campaignIds")
    .map((value) => String(value))
    .filter(Boolean);

  const adminClient = createSupabaseAdminClient()!;
  const hasExistingUser = Boolean(parsed.data.userId);
  const activeClient = parsed.data.clientActive === "on";
  const activeAccess = parsed.data.accessActive === "on";
  const password = (parsed.data.password || "").trim();

  const clientUpdate = await adminClient
    .from("clients")
    .update({
      nome_empresa: parsed.data.companyName,
      responsavel: parsed.data.contactName,
      whatsapp: parsed.data.whatsapp,
      observacoes: parsed.data.notes || null,
      ativo: activeClient,
    })
    .eq("id", parsed.data.clientId);

  if (clientUpdate.error) {
    return { error: clientUpdate.error.message };
  }

  let userId = parsed.data.userId || "";
  let authUserId = parsed.data.authUserId || "";

  if (hasExistingUser && authUserId) {
    const authUpdate = await adminClient.auth.admin.updateUserById(authUserId, {
      email: parsed.data.email,
      password: password.length > 0 ? password : undefined,
      user_metadata: {
        username: parsed.data.username,
        nome: parsed.data.accountName,
      },
    });

    if (authUpdate.error) {
      return { error: authUpdate.error.message };
    }

    const userUpdate = await adminClient
      .from("users")
      .update({
        nome: parsed.data.accountName,
        username: parsed.data.username,
        email: parsed.data.email,
        whatsapp: parsed.data.whatsapp,
        ativo: activeAccess,
      })
      .eq("id", userId);

    if (userUpdate.error) {
      return { error: userUpdate.error.message };
    }
  } else {
    if (password.length < 6) {
      return { error: "Informe uma senha com ao menos 6 caracteres para criar o acesso." };
    }

    const authResult = await adminClient.auth.admin.createUser({
      email: parsed.data.email,
      password,
      email_confirm: true,
      user_metadata: {
        username: parsed.data.username,
        nome: parsed.data.accountName,
      },
    });

    if (authResult.error || !authResult.data.user) {
      return { error: authResult.error?.message ?? "Falha ao criar usuário auth." };
    }

    authUserId = authResult.data.user.id;

    const userInsert = await adminClient
      .from("users")
      .insert({
        auth_user_id: authUserId,
        nome: parsed.data.accountName,
        username: parsed.data.username,
        email: parsed.data.email,
        role: "client",
        whatsapp: parsed.data.whatsapp,
        ativo: activeAccess,
        client_id: parsed.data.clientId,
      })
      .select("id")
      .single();

    if (userInsert.error || !userInsert.data) {
      await adminClient.auth.admin.deleteUser(authUserId);
      return { error: userInsert.error?.message ?? "Falha ao criar perfil do cliente." };
    }

    userId = userInsert.data.id;
  }

  if (userId) {
    const permissionsDelete = await adminClient
      .from("user_campaign_permissions")
      .delete()
      .eq("user_id", userId);

    if (permissionsDelete.error) {
      return { error: permissionsDelete.error.message };
    }

    if (campaignIds.length > 0) {
      const permissionInsert = await adminClient
        .from("user_campaign_permissions")
        .insert(
          campaignIds.map((campaignId) => ({
            user_id: userId,
            campaign_id: campaignId,
          })),
        );

      if (permissionInsert.error) {
        return { error: permissionInsert.error.message };
      }
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/clientes");
  revalidatePath(`/admin/clientes/${parsed.data.clientId}`);
  revalidatePath("/dashboard");

  return { success: "Cliente atualizado com sucesso." };
}

export async function deleteClientWorkspaceAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const guarded = guardSupabase();
  if (guarded) return guarded;

  const clientId = String(formData.get("clientId") || "");
  const userId = String(formData.get("userId") || "");
  const authUserId = String(formData.get("authUserId") || "");

  if (!clientId) {
    return { error: "Cliente inválido para exclusão." };
  }

  const adminClient = createSupabaseAdminClient()!;

  if (userId) {
    const permissionsDelete = await adminClient
      .from("user_campaign_permissions")
      .delete()
      .eq("user_id", userId);

    if (permissionsDelete.error) {
      return { error: permissionsDelete.error.message };
    }

    const userDelete = await adminClient.from("users").delete().eq("id", userId);

    if (userDelete.error) {
      return { error: userDelete.error.message };
    }
  }

  if (authUserId) {
    const authDelete = await adminClient.auth.admin.deleteUser(authUserId);

    if (authDelete.error) {
      return { error: authDelete.error.message };
    }
  }

  const clientDelete = await adminClient.from("clients").delete().eq("id", clientId);

  if (clientDelete.error) {
    return { error: clientDelete.error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/clientes");
  return { success: "Cliente excluído com sucesso." };
}

export async function createClientAccountAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const guarded = guardSupabase();
  if (guarded) return guarded;

  const parsed = accountSchema.safeParse({
    name: formData.get("name"),
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
    whatsapp: formData.get("whatsapp"),
    clientId: formData.get("clientId"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  const adminClient = createSupabaseAdminClient()!;

  const authResult = await adminClient.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });

  if (authResult.error || !authResult.data.user) {
    return { error: authResult.error?.message ?? "Falha ao criar usuário auth." };
  }

  const { error } = await adminClient.from("users").insert({
    auth_user_id: authResult.data.user.id,
    nome: parsed.data.name,
    username: parsed.data.username,
    email: parsed.data.email,
    role: "client",
    whatsapp: parsed.data.whatsapp,
    ativo: true,
    client_id: parsed.data.clientId,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin");
  return { success: "Conta do cliente criada com sucesso." };
}

export async function assignCampaignPermissionAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const guarded = guardSupabase();
  if (guarded) return guarded;

  const parsed = permissionSchema.safeParse({
    userId: formData.get("userId"),
    campaignId: formData.get("campaignId"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  const adminClient = createSupabaseAdminClient()!;
  const { error } = await adminClient.from("user_campaign_permissions").upsert({
    user_id: parsed.data.userId,
    campaign_id: parsed.data.campaignId,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin");
  return { success: "Permissão vinculada com sucesso." };
}
