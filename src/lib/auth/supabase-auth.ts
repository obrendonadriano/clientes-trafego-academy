import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { User } from "@/lib/types";

type ProfileRow = {
  id: string;
  auth_user_id: string | null;
  nome: string;
  username: string;
  email: string;
  role: "admin" | "client";
  whatsapp: string | null;
  ativo: boolean;
  client_id: string | null;
  clients?: Array<{
    nome_empresa: string;
  }> | null;
};

function mapProfile(row: ProfileRow): User {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    name: row.nome,
    username: row.username,
    email: row.email,
    role: row.role,
    whatsapp: row.whatsapp ?? "",
    active: row.ativo,
    clientId: row.client_id,
    clientName: row.clients?.[0]?.nome_empresa,
  };
}

export async function signInWithSupabase(identifier: string, password: string) {
  const adminClient = createSupabaseAdminClient();
  const serverClient = await createSupabaseServerClient();

  if (!adminClient || !serverClient) {
    return null;
  }

  const normalizedIdentifier = identifier.trim().toLowerCase();

  const { data: profileRow, error: profileError } = await adminClient
    .from("users")
    .select("id, auth_user_id, nome, username, email, role, whatsapp, ativo, client_id, clients(nome_empresa)")
    .or(`username.eq.${normalizedIdentifier},email.eq.${normalizedIdentifier}`)
    .maybeSingle();

  if (profileError || !profileRow || !profileRow.ativo) {
    return null;
  }

  const { error: authError } = await serverClient.auth.signInWithPassword({
    email: profileRow.email,
    password,
  });

  if (authError) {
    return null;
  }

  return mapProfile(profileRow as ProfileRow);
}

export async function signOutFromSupabase() {
  const serverClient = await createSupabaseServerClient();

  if (!serverClient) {
    return;
  }

  await serverClient.auth.signOut();
}

export async function getSupabaseCurrentUser() {
  const serverClient = await createSupabaseServerClient();
  const adminClient = createSupabaseAdminClient();

  if (!serverClient || !adminClient) {
    return null;
  }

  const {
    data: { user: authUser },
  } = await serverClient.auth.getUser();

  if (!authUser) {
    return null;
  }

  const { data: profileRow, error } = await adminClient
    .from("users")
    .select("id, auth_user_id, nome, username, email, role, whatsapp, ativo, client_id, clients(nome_empresa)")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();

  if (error || !profileRow || !profileRow.ativo) {
    return null;
  }

  return mapProfile(profileRow as ProfileRow);
}
