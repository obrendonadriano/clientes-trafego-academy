import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { type Embedded, firstEmbedded } from "@/lib/supabase/embedded";
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
  clients?: Embedded<{
    nome_empresa: string;
    ativo: boolean;
  }>;
};

const PROFILE_COLUMNS =
  "id, auth_user_id, nome, username, email, role, whatsapp, ativo, client_id, clients(nome_empresa, ativo)";

// Sem acesso ao portal: usuário desativado, ou cliente cuja empresa está
// inativa no cadastro. Vale no login e em toda requisição, então desativar a
// empresa derruba na hora quem já estava logado.
function hasPortalAccess(row: ProfileRow) {
  if (!row.ativo) {
    return false;
  }

  if (row.role === "client" && firstEmbedded(row.clients)?.ativo === false) {
    return false;
  }

  return true;
}

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
    clientName: firstEmbedded(row.clients)?.nome_empresa,
  };
}

export async function signInWithSupabase(identifier: string, password: string) {
  const adminClient = createSupabaseAdminClient();
  const serverClient = await createSupabaseServerClient({
    allowCookieWrites: true,
  });

  if (!adminClient || !serverClient) {
    return null;
  }

  const normalizedIdentifier = identifier.trim().toLowerCase();

  const { data: profileRow, error: profileError } = await adminClient
    .from("users")
    .select(PROFILE_COLUMNS)
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

  // Senha certa, mas a empresa do cliente está inativa: encerra a sessão
  // recém-criada e avisa o motivo (em vez de "senha inválida").
  if (!hasPortalAccess(profileRow as ProfileRow)) {
    await serverClient.auth.signOut();
    return "blocked" as const;
  }

  return mapProfile(profileRow as ProfileRow);
}

export async function signOutFromSupabase() {
  const serverClient = await createSupabaseServerClient({
    allowCookieWrites: true,
  });

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

  const { data: claimsData, error: claimsError } =
    await serverClient.auth.getClaims();
  const authUserId = claimsData?.claims?.sub;

  if (claimsError || !authUserId) {
    return null;
  }

  const { data: profileRow, error } = await adminClient
    .from("users")
    .select(PROFILE_COLUMNS)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error || !profileRow || !hasPortalAccess(profileRow as ProfileRow)) {
    return null;
  }

  return mapProfile(profileRow as ProfileRow);
}
