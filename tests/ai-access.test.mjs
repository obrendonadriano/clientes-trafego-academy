// Acesso ao Atendimento IA: regra única, falha ≠ bloqueio, estados da tela,
// rota de estado, porteiro das actions, robô e trava do banco.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import {
  aiAllowedPlans,
  decideAiAccess,
  toAiAccessState,
} from "../src/lib/ai-agent/shared.ts";

const require = createRequire(import.meta.url);

// Executa o TS real; `overrides` troca módulos por caminho absoluto ou nome.
function loader(overrides = {}) {
  const cache = new Map();
  function load(path) {
    path = resolve(path);
    if (overrides[path]) return overrides[path];
    if (cache.has(path)) return cache.get(path);
    const exports = {};
    cache.set(path, exports);
    const js = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    const localRequire = (spec) => {
      if (spec === "server-only") return {};
      if (overrides[spec]) return overrides[spec];
      if (spec.startsWith("@/") || spec.startsWith(".")) {
        let target = spec.startsWith("@/")
          ? resolve("src", spec.slice(2))
          : resolve(dirname(path), spec);
        if (!existsSync(target)) target += existsSync(`${target}.ts`) ? ".ts" : ".tsx";
        if (overrides[target]) return overrides[target];
        return load(target);
      }
      return require(spec);
    };
    new Function("exports", "require", "fetch", js)(exports, localRequire, fetch);
    return exports;
  }
  return load;
}

const src = (path) => resolve("src", path);

// Supabase falso: cada `await` de uma consulta chama handler(table, ops).
function fakeSupabase(handler) {
  const calls = [];
  return {
    calls,
    from(table) {
      const ops = [];
      calls.push({ table, ops });
      const builder = new Proxy(
        {},
        {
          get(_, prop) {
            if (prop === "then") {
              const result = Promise.resolve().then(() => handler(table, ops));
              return result.then.bind(result);
            }
            return (...args) => {
              ops.push([prop, ...args]);
              return builder;
            };
          },
        },
      );
      return builder;
    },
  };
}

const NET_FAIL = { data: null, error: { message: "TypeError: fetch failed", code: "" }, status: 0 };

function loadStore(handler) {
  const client = fakeSupabase(handler);
  const store = loader({
    "@/lib/supabase/admin": { createSupabaseAdminClient: () => client },
  })(src("lib/ai-agent/store.ts"));
  return { store, client };
}

// ---------------------------------------------------------------------------

test("regra única: Essencial e Completo liberados pelo interruptor; Essencial bloqueado sem ele", () => {
  assert.deepEqual(aiAllowedPlans(true), ["essential", "complete"]);
  assert.deepEqual(aiAllowedPlans(false), ["complete"]);
  const vehicle = { segmentEligible: true };
  assert.deepEqual(decideAiAccess({ ...vehicle, plan: "essential", allPlans: true }), { allowed: true });
  assert.deepEqual(decideAiAccess({ ...vehicle, plan: "complete", allPlans: true }), { allowed: true });
  assert.deepEqual(decideAiAccess({ ...vehicle, plan: "complete", allPlans: false }), { allowed: true });
  assert.deepEqual(decideAiAccess({ ...vehicle, plan: "essential", allPlans: false }), {
    allowed: false,
    reason: "plan",
  });
  // Segmento errado bloqueia mesmo no Completo, e o motivo é o segmento.
  assert.deepEqual(decideAiAccess({ segmentEligible: false, plan: "complete", allPlans: true }), {
    allowed: false,
    reason: "segment",
  });
  assert.equal(toAiAccessState({ allowed: false, reason: "plan" }), "denied_plan");
  assert.equal(toAiAccessState({ allowed: false, reason: "segment" }), "denied_segment");
});

test("causa do bloqueio indevido: falha de rede no interruptor não vira mais 'sem acesso'", async () => {
  // Cliente Essencial com a IA liberada para todos os planos.
  let settingsCalls = 0;
  const { store } = loadStore((table) => {
    if (table === "clients") {
      return { data: { plan_type: "essential", segmento: "veiculo_atrasado" }, error: null, status: 200 };
    }
    if (table === "platform_settings") {
      settingsCalls += 1;
      // 1ª tentativa cai (oscilação de rede), a 2ª responde.
      return settingsCalls === 1 ? NET_FAIL : { data: { ai_all_plans: true }, error: null, status: 200 };
    }
    throw new Error(`tabela inesperada ${table}`);
  });

  const access = await store.getClientAiAccess("c1");
  assert.equal(settingsCalls, 2, "tentou de novo após a falha passageira");
  assert.deepEqual(access.decision, { allowed: true });
  assert.equal(access.plan, "essential", "plano real preservado (não 'complete' fingido)");
  assert.equal(access.allPlans, true);
});

test("falha persistente lança erro (vira estado de erro), nunca devolve 'negado'", async () => {
  let attempts = 0;
  const { store } = loadStore((table) => {
    if (table === "clients") {
      return { data: { plan_type: "essential", segmento: "veiculo_atrasado" }, error: null, status: 200 };
    }
    attempts += 1;
    return { data: null, error: { message: "upstream", code: "" }, status: 503 };
  });

  await assert.rejects(store.getClientAiAccess("c1"), (error) => {
    assert.equal(error.name, "AiAgentError");
    assert.equal(error.status, 503);
    return true;
  });
  assert.equal(attempts, 3, "3 tentativas antes de desistir");
});

test("erro definitivo (não passageiro) não fica tentando e também não nega", async () => {
  let attempts = 0;
  const { store } = loadStore((table) => {
    if (table === "clients") {
      attempts += 1;
      return { data: null, error: { message: "permission denied", code: "42501" }, status: 403 };
    }
    return { data: { ai_all_plans: true }, error: null, status: 200 };
  });
  await assert.rejects(store.getClientAiAccess("c1"));
  assert.equal(attempts, 1);
});

test("sem a migração do interruptor, vale só o Plano Completo (sem erro)", async () => {
  const { store } = loadStore((table, ops) => {
    if (table === "platform_settings") {
      return { data: null, error: { message: "relation does not exist", code: "PGRST205" }, status: 404 };
    }
    return { data: { plan_type: ops.length ? "essential" : "essential", segmento: "veiculo_atrasado" }, error: null, status: 200 };
  });
  const access = await store.getClientAiAccess("c1");
  assert.equal(access.allPlans, false);
  assert.deepEqual(access.decision, { allowed: false, reason: "plan" });
});

test("consulta de acesso é isolada por cliente (filtra pelo id da conta)", async () => {
  const { store, client } = loadStore((table) =>
    table === "clients"
      ? { data: { plan_type: "complete", segmento: "veiculo_atrasado" }, error: null, status: 200 }
      : { data: { ai_all_plans: false }, error: null, status: 200 },
  );
  await store.getClientAiAccess("cliente-xyz");
  const clients = client.calls.find((call) => call.table === "clients");
  assert.deepEqual(clients.ops.find(([op]) => op === "eq"), ["eq", "id", "cliente-xyz"]);
});

test("contagem de leads com erro lança (antes mostrava 0 em silêncio)", async () => {
  const { store } = loadStore(() => ({ count: null, data: null, error: { message: "x", code: "" }, status: 500 }));
  await assert.rejects(store.countConversations("c1"));
});

// ---------------------------------------------------------------------------
// Página: estados de acesso
// ---------------------------------------------------------------------------

const baseSettings = {
  clientId: "c1",
  enabled: false,
  knowledge: { profile: {}, activation: {}, script: {} },
};

function loadPage(storeOverrides, configured = true) {
  const store = {
    AiAgentError: class extends Error {},
    getClientAiAccess: async () => ({
      plan: "essential",
      segment: "veiculo_atrasado",
      allPlans: true,
      decision: { allowed: true },
    }),
    ensureAiAgentSettings: async () => baseSettings,
    getAiAgentSettings: async () => baseSettings,
    getSessionForClient: async () => ({ status: "WORKING", phoneNumber: "5511999999999" }),
    listConversations: async () => [{ id: "lead" }],
    countConversations: async () => ({ total: 1, qualified: 0 }),
    getAiLiveFingerprint: async () => "fp-1",
    ...storeOverrides,
  };
  return loader({
    [src("lib/ai-agent/store.ts")]: store,
    [src("lib/ai-agent/blocked.ts")]: { listBlockedNumbers: async () => [] },
    "@/lib/env": { isSupabaseAdminConfigured: () => configured },
  })(src("lib/data/ai-agent.ts"));
}

const user = (over = {}) => ({ id: "u1", role: "client", active: true, clientId: "c1", ...over });

test("Essencial com IA liberada entra direto (primeiro acesso, sem precisar atualizar)", async () => {
  const data = await loadPage({}).getAiAgentPageData(user());
  assert.equal(data.access, "allowed");
  assert.equal(data.plan, "essential");
  assert.equal(data.fingerprint, "fp-1");
  assert.equal(data.conversations.length, 1);
});

test("Completo entra; Essencial sem liberação vê o cadeado; segmento errado vê aviso próprio", async () => {
  const complete = await loadPage({
    getClientAiAccess: async () => ({ plan: "complete", segment: "veiculo_atrasado", allPlans: false, decision: { allowed: true } }),
  }).getAiAgentPageData(user());
  assert.equal(complete.access, "allowed");

  let created = false;
  const denied = await loadPage({
    getClientAiAccess: async () => ({ plan: "essential", segment: "veiculo_atrasado", allPlans: false, decision: { allowed: false, reason: "plan" } }),
    ensureAiAgentSettings: async () => {
      created = true;
      return baseSettings;
    },
    listConversations: async () => {
      throw new Error("não deveria listar leads sem acesso");
    },
  }).getAiAgentPageData(user());
  assert.equal(denied.access, "denied_plan");
  assert.equal(created, false, "sem acesso não cria configuração");
  assert.deepEqual(denied.conversations, [], "sem acesso não recebe leads");

  const segment = await loadPage({
    getClientAiAccess: async () => ({ plan: "complete", segment: "eventos", allPlans: true, decision: { allowed: false, reason: "segment" } }),
  }).getAiAgentPageData(user());
  assert.equal(segment.access, "denied_segment");
});

test("falha ao consultar o acesso mostra ERRO (com tentar de novo), não bloqueio de plano", async () => {
  const data = await loadPage({
    getClientAiAccess: async () => {
      throw new Error("fetch failed");
    },
  }).getAiAgentPageData(user());
  assert.equal(data.access, "error");
  assert.notEqual(data.access, "denied_plan");
});

test("acesso confirmado mas leads indisponíveis: erro, não bloqueio nem zeros falsos", async () => {
  const data = await loadPage({
    countConversations: async () => {
      throw new Error("timeout");
    },
  }).getAiAgentPageData(user());
  assert.equal(data.access, "error");
});

test("sem banco configurado ou sem empresa vinculada: indisponível, não 'faça upgrade'", async () => {
  assert.equal((await loadPage({}, false).getAiAgentPageData(user())).access, "not_configured");
  assert.equal((await loadPage({}).getAiAgentPageData(user({ clientId: null }))).access, "not_configured");
});

// ---------------------------------------------------------------------------
// Rota /api/ia/estado (sessões abertas e acesso direto)
// ---------------------------------------------------------------------------

function loadRoute({ currentUser = user(), access, fingerprint = "fp-2" } = {}) {
  return loader({
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/auth/session": { getOptionalCurrentUser: async () => currentUser },
    "@/lib/env": { isSupabaseAdminConfigured: () => true },
    [src("lib/ai-agent/store.ts")]: {
      getClientAiAccess: async () => {
        if (access instanceof Error) throw access;
        return { decision: access ?? { allowed: true } };
      },
      getAiLiveFingerprint: async () => fingerprint,
    },
  })(src("app/api/ia/estado/route.ts"));
}

test("rota de estado: sem login 401, admin 401, sem cache", async () => {
  let response = await loadRoute({ currentUser: null }).GET();
  assert.equal(response.status, 401);
  assert.match(response.headers.get("cache-control"), /no-store/);
  response = await loadRoute({ currentUser: user({ role: "admin" }) }).GET();
  assert.equal(response.status, 401);
});

test("rota de estado: liberação muda com a sessão aberta -> a tela percebe", async () => {
  // Admin desligou a liberação: a rota diz "denied_plan" sem dados.
  let body = await (await loadRoute({ access: { allowed: false, reason: "plan" } }).GET()).json();
  assert.deepEqual(body, { access: "denied_plan", fingerprint: null });
  // Admin ligou de novo: "allowed" com impressão digital.
  body = await (await loadRoute({}).GET()).json();
  assert.deepEqual(body, { access: "allowed", fingerprint: "fp-2" });
});

test("rota de estado: falha de consulta é 503 (a tela mantém o que mostra), não 'negado'", async () => {
  const response = await loadRoute({ access: new Error("fetch failed") }).GET();
  assert.equal(response.status, 503);
});

// ---------------------------------------------------------------------------
// Server actions: acesso direto ao recurso
// ---------------------------------------------------------------------------

function loadActions({ access, currentUser = user() }) {
  const revalidated = [];
  const updates = [];
  class AiAgentError extends Error {
    constructor(message, status = 500) {
      super(message);
      this.name = "AiAgentError";
      this.status = status;
    }
  }
  const actions = loader({
    "next/cache": { revalidatePath: (path) => revalidated.push(path) },
    "@/lib/auth/session": { getOptionalCurrentUser: async () => currentUser },
    "@/lib/waha": {},
    [src("lib/ai-agent/transitions.ts")]: { transition: async () => ({}) },
    [src("lib/ai-agent/blocked.ts")]: {},
    [src("lib/ai-agent/store.ts")]: {
      AiAgentError,
      getClientAiAccess: async () => {
        if (access instanceof Error) throw access;
        return { decision: access };
      },
      getSessionForClient: async () => ({ status: "WORKING" }),
      ensureAiAgentSettings: async () => baseSettings,
      updateAiAgentSettings: async (clientId, patch) => updates.push({ clientId, patch }),
    },
  })(src("app/dashboard/atendimento-ia/actions.ts"));
  return { actions, revalidated, updates };
}

const toggleForm = (enabled) => {
  const form = new FormData();
  form.set("enabled", String(enabled));
  return form;
};

test("action sem permissão: recusa no servidor e já devolve a tela atualizada", async () => {
  const { actions, revalidated, updates } = loadActions({ access: { allowed: false, reason: "plan" } });
  const state = await actions.toggleAiAgentAction({}, toggleForm(true));
  assert.match(state.error, /não está liberado para o plano/);
  assert.equal(updates.length, 0, "nada gravado");
  assert.ok(revalidated.includes("/dashboard/atendimento-ia"));
});

test("action com falha de consulta: pede para tentar de novo, não fala em plano", async () => {
  const { actions, updates } = loadActions({ access: new Error("fetch failed") });
  const state = await actions.toggleAiAgentAction({}, toggleForm(true));
  assert.match(state.error, /Não foi possível confirmar seu acesso/);
  assert.doesNotMatch(state.error, /plano/i);
  assert.equal(updates.length, 0);
});

test("action com acesso (Essencial liberado) grava só na própria conta", async () => {
  const { actions, updates } = loadActions({ access: { allowed: true } });
  const state = await actions.toggleAiAgentAction({}, toggleForm(true));
  assert.equal(state.error, undefined);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].clientId, "c1");
  assert.equal(updates[0].patch.enabled, true);
});

test("action de usuário admin ou inativo é recusada", async () => {
  for (const currentUser of [user({ role: "admin" }), user({ active: false }), null]) {
    const { actions, updates } = loadActions({ access: { allowed: true }, currentUser });
    const state = await actions.toggleAiAgentAction({}, toggleForm(true));
    assert.match(state.error, /permissão/);
    assert.equal(updates.length, 0);
  }
});

// ---------------------------------------------------------------------------
// Robô de atendimento
// ---------------------------------------------------------------------------

function loadPipeline(getClientAiAccess) {
  const typing = [];
  const pipeline = loader({
    "@/lib/waha": {
      getWahaConfig: async () => ({}),
      setWahaTyping: async (_config, input) => typing.push(input.typing),
    },
    [src("lib/ai-agent/transitions.ts")]: {
      transition: async (_client, action) =>
        action === "reconcile" ? { busy: false, stopTyping: false } : { ok: false },
    },
    [src("lib/ai-agent/store.ts")]: {
      AiAgentError: class extends Error {},
      findSessionOwner: async () => ({ clientId: "c1", sessionName: "s", status: "WORKING" }),
      getAiAgentSettings: async () => ({ enabled: true }),
      findConversation: async () => ({ id: "conv" }),
      findConversationById: async () => ({ id: "conv", human_takeover: false }),
      getClientAiAccess,
    },
  })(src("lib/ai-agent/pipeline.ts"));
  return { pipeline, typing };
}

test("robô: falha ao consultar acesso espera e tenta de novo (não abandona o lead)", async () => {
  const { pipeline } = loadPipeline(async () => {
    throw new Error("fetch failed");
  });
  const step = await pipeline.advanceConversation({ sessionName: "s", chatId: "5511999990000@c.us" });
  assert.equal(step.acao, "aguardar");
});

test("robô: sem acesso para (e desliga o 'digitando')", async () => {
  const { pipeline, typing } = loadPipeline(async () => ({ decision: { allowed: false, reason: "plan" } }));
  const step = await pipeline.advanceConversation({ sessionName: "s", chatId: "5511999990000@c.us" });
  assert.equal(step.acao, "fim");
  assert.deepEqual(typing, [false]);
});

// ---------------------------------------------------------------------------
// Banco: troca de plano com e sem o interruptor
// ---------------------------------------------------------------------------

const readMigration = (name) => readFileSync(resolve("supabase/migrations", name), "utf8");

test("banco: troca de plano respeita o interruptor (downgrade só desliga a IA se não liberada)", async () => {
  const db = new PGlite();
  const C = "00000000-0000-4000-8000-0000000000c1";
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create table clients(id uuid primary key,nome_empresa text);
      create table users(id uuid primary key,auth_user_id uuid,client_id uuid,role text,ativo boolean);
      create table whatsapp_sessions(client_id uuid,session_name text,status text,phone_number text);
      grant select on clients,users to service_role;`);
    await db.exec(readMigration("20260916120000_ai_agent_whatsapp.sql"));
    await db.exec(readMigration("20260924173314_ai_attendance_v2.sql"));
    await db.exec(readMigration("20261029130000_ai_all_plans.sql"));
    await db.exec(`insert into clients(id,plan_type) values('${C}','complete');
      insert into ai_agent_settings(client_id,enabled) values('${C}',true);`);
    const enabled = async () =>
      (await db.query(`select enabled from ai_agent_settings`)).rows[0].enabled;

    await db.exec(`set request.jwt.claims='{"role":"service_role"}'; set role service_role`);
    await db.exec(`select public.admin_set_ai_all_plans(true)`);
    await db.exec(`reset role`);

    // Completo -> Essencial com a IA liberada para todos: continua ligada.
    await db.exec(`update clients set plan_type='essential'`);
    assert.equal(await enabled(), true);

    // Essencial -> Completo -> Essencial com o interruptor desligado: desliga.
    await db.exec(`update clients set plan_type='complete'`);
    await db.exec(`set role service_role; select public.admin_set_ai_all_plans(false); reset role`);
    assert.equal(await enabled(), true, "Completo mantém a IA ao desligar o interruptor");
    await db.exec(`update clients set plan_type='essential'`);
    assert.equal(await enabled(), false);
    // E o Essencial não consegue religar por fora (acesso direto ao banco).
    await assert.rejects(db.exec(`update ai_agent_settings set enabled=true`));
  } finally {
    await db.close();
  }
});
