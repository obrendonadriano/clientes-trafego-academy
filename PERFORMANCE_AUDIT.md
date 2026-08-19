# Auditoria de performance — Tráfego Academy Dashboard

Data da auditoria: 19/08/2026

## Resumo executivo

O maior gargalo não era um único componente visual. Era a soma de três decisões
arquiteturais: duas páginas administrativas aguardavam a Meta em tempo real,
o dashboard carregava uma janela fixa de 92 dias mesmo quando o usuário pedia
30 dias e a sincronização repetia trabalho histórico e chamadas já feitas.

O código foi alterado para a arquitetura **Supabase primeiro**:

```text
Meta Marketing API
        │
        ▼
ação manual protegida (lock + timeout + retries controlados)
        │
        ├── campanhas e métricas por campanha
        └── snapshots diários de conjuntos e anúncios
                            │
                            ▼
                     Supabase/Postgres
                            │
          ┌─────────────────┴─────────────────┐
          ▼                                   ▼
 Next.js Server Components              Server Actions/API
 (leitura por janela exata)             (admin/cliente autenticados)
          │
          ▼
 dashboard; nenhuma chamada à Meta no caminho de abertura
```

As mudanças estão implementadas e o build passa. As duas migrações novas ainda
precisam ser aplicadas no projeto Supabase de produção correto. O conector
disponível nesta sessão apontava para outro projeto; por segurança, nenhuma
migração foi aplicada no banco errado e nenhum deploy foi feito.

## Arquitetura atual mapeada

- **Framework:** Next.js 16.2.2 App Router, React 19.2.4, Server Components,
  Server Actions e Proxy/Middleware.
- **Hospedagem:** Vercel, função na região `iad1`, runtime configurado como
  Node.js 24. O build local foi validado com Node.js 22.
- **Banco/Auth:** Supabase Postgres + Supabase Auth. A aplicação lê e grava os
  dados de negócio no servidor com `service_role`; a chave privilegiada não é
  enviada ao navegador.
- **Dados:** `clients`, `users`, `campaigns`,
  `user_campaign_permissions`, `campaign_metrics`, `ai_reports`,
  `meta_ad_accounts`, `integration_settings` e `sync_statuses`. A nova tabela
  `meta_ad_level_metrics` guarda snapshots de conjuntos e anúncios.
- **Ingestão Meta:** o botão do administrador ou cliente chama `runMetaSync()`, lista
  contas habilitadas, importa campanhas, insights e snapshots de níveis,
  converte moeda e faz upsert em lotes no Supabase.
- **Leitura:** páginas chamam funções de `src/lib/data/queries.ts`. Cadastros e
  metadados usam cache compartilhado por tags; métricas privadas usam cache
  por requisição e filtro de tenant/campanhas autorizadas.
- **Frontend:** os dados já chegam no payload de Server Components. Não há
  React Query/SWR, polling agressivo nem subscriptions Realtime recriadas.
  Filtros e agregações visuais são calculados com `useMemo` sobre a janela já
  reduzida pelo servidor.
- **PWA:** o service worker agora guarda somente JS, CSS, fontes e imagens.
  HTML, RSC, APIs e dados autenticados sempre passam pela rede.

## Evidências e baseline

### Volume do banco observado

Leitura somente leitura via REST do projeto configurado localmente:

| Tabela/conjunto | Linhas |
|---|---:|
| clientes | 28 |
| usuários | 29 |
| campanhas | 195 |
| permissões | 316 |
| métricas totais | 25.965 |
| métricas diárias | 1.643 |
| métricas horárias | 24.322 |
| relatórios | 83 |
| contas Meta | 2 |

As contagens exatas levaram aproximadamente 0,5–1,8 s por chamada a partir
deste ambiente. Isso mede o caminho de rede até o Supabase, não o custo isolado
do executor Postgres.

### Métricas do dashboard antes

O caminho anterior carregava sempre 92 dias de linhas diárias e também linhas
horárias recentes, independentemente do filtro padrão de 30 dias:

| Medida | Antes |
|---|---:|
| janela solicitada ao banco | 92 dias + horas recentes |
| linhas transferidas | 1.924 |
| payload JSON | 778.071 bytes |
| requests paginados | 3 |
| tempo observado | 1.662 ms |

### Resposta HTTP pública em produção

Medições de cinco requisições em `cliente.trafegoacademy.online`:

| Rota | primeira TTFB observada | TTFB aquecida típica | bytes HTML |
|---|---:|---:|---:|
| `/login` | 1.588 ms | 120–149 ms | 38.714 |
| `/` | 295 ms | 114–171 ms | 38.228 |

A primeira amostra de `/login` mostra efeito de cold start/rede. As rotas
públicas aquecidas já são rápidas; isso isolou o problema principal na cadeia
autenticada de dados. Não havia credenciais de teste autorizadas para medir o
tempo até os dados aparecerem em produção.

## Gargalos encontrados

### CRÍTICO — Meta no caminho de renderização

- **Local:** `src/lib/data/ad-levels.ts` e páginas de conjuntos/anúncios.
- **Causa:** abertura das abas consultava a Marketing API, paginava e agregava
  a resposta antes de renderizar.
- **Impacto:** latência externa, timeout, retry e rate limit podiam bloquear a
  tela inteira por segundos ou fazê-la falhar.
- **Evidência:** chamadas `fetchMetaAdSets`/`fetchMetaLevelInsights` eram
  alcançadas diretamente pelo carregamento das páginas.
- **Correção:** snapshots diários no Supabase, RPC de agregação por janela e
  Meta restrita ao job de sincronização. Chamadas Meta ao abrir essas páginas:
  **mais de zero → zero**.

### CRÍTICO — isolamento de tenant incompleto

- **Local:** layouts `/admin` e `/dashboard`, Server Actions de Meta.
- **Causa:** o proxy confirmava sessão, mas não o papel de negócio quando
  Supabase estava habilitado; páginas internas usam `service_role`.
- **Impacto:** um cliente autenticado poderia alcançar uma rota administrativa,
  transformando uma otimização de backend em risco de exposição entre tenants.
- **Correção:** guardas de papel nos layouts e autenticação/role em todas as
  ações de sincronização/importação.

### CRÍTICO — cache privado no navegador

- **Local:** `public/sw.js` e `service-worker-register.tsx`.
- **Causa:** HTML autenticado era armazenado em Cache Storage.
- **Impacto:** conteúdo obsoleto, navegação aparentemente inconsistente e risco
  de uma sessão posterior ler uma página privada da sessão anterior.
- **Correção:** somente assets imutáveis entram no cache; navegação, RSC, API e
  dados privados sempre usam a rede. A ativação remove os caches antigos.

### ALTO — janela e payload de métricas excessivos

- **Local:** `src/lib/data/date-range.ts` e `src/lib/data/queries.ts`.
- **Causa:** janela fixa de 92 dias, horas carregadas mesmo para gráficos de
  7/30 dias e paginação causada por 1.924 linhas.
- **Impacto medido:** 778 KB, três requests e 1,66 s no cenário de referência.
- **Correção:** traduzir o filtro da URL para a janela exata, incluir o período
  anterior somente quando a comparação está ativa e buscar granularidade
  horária apenas em períodos de um dia.

### ALTO — sincronização duplicada e pouco incremental

- **Local:** `src/app/admin/campanhas/actions.ts`, rotas de sync e
  `src/lib/sync/meta-sync.ts`.
- **Causa:** campanhas eram importadas duas vezes na mesma execução, insights
  históricos eram repetidos, não havia mutex e requests externos não tinham
  timeout.
- **Impacto:** mais chamadas Meta, mais upserts, risco de duas execuções
  concorrentes e funções presas até o limite da plataforma.
- **Correção:** uma única importação de campanhas, histórico de 30 dias somente
  na primeira execução/domingo e 7 dias nas demais, snapshots de níveis com
  backfill inicial de 92 dias e reconciliação de 7 dias, upserts em lotes de
  500, lock com recuperação após 10 minutos e timeout de 30 segundos por
  request. Rate limit continua com retry/backoff controlado.

### ALTO — autenticação repetida e com round-trip evitável

- **Local:** `src/proxy.ts`, `src/lib/auth/session.ts` e
  `src/lib/auth/supabase-auth.ts`.
- **Causa:** proxy, layout e página repetiam validação; `getUser()` faz chamada
  ao Auth server.
- **Correção:** `getClaims()` no proxy e no servidor, propagação correta de
  cookies/headers renovados e `React.cache()` para deduplicar sessão + perfil
  dentro da mesma renderização. Em projetos com JWT assimétrico, a validação
  usa JWKS em cache e evita a chamada por request ao Auth server.

### ALTO — RLS administrativa baseada no claim errado

- **Local:** políticas originais em `supabase/schema.sql`.
- **Causa:** `auth.jwt()->>'role' = 'admin'` compara o papel do Supabase Auth
  (`authenticated`) com o papel de negócio guardado em `public.users`.
- **Impacto:** políticas administrativas não representavam a autorização real;
  políticas de cliente também executavam `auth.uid()` por linha.
- **Correção:** migração cria `is_app_admin()` segura, usa `(select auth.uid())`
  e `(select is_app_admin())`, mantém RLS e adiciona o índice de permissões pelo
  lado `campaign_id`. A função global `prune_ai_reports` deixa de ser executável
  por usuários comuns.

### MÉDIO — duplicação da biblioteca de gráficos

- **Local:** dashboards admin/cliente e componentes Recharts.
- **Causa:** `PerformanceChart` e `ComparisonChart` estavam em boundaries
  dinâmicos separados; o build emitia cópias grandes do runtime de gráficos.
- **Evidência:** três chunks de 383,5 KB brutos.
- **Correção:** boundary único `DashboardChart`, ainda lazy. O build passou a
  emitir dois chunks pesados de 375,9 KB (o segundo atende o gráfico de
  campanhas), retirando cerca de 399 KB brutos dos artefatos pesados.

### RESOLVIDO — agendamento removido

- O plano utiliza atualização exclusivamente manual pelos botões do administrador
  e do cliente. Cron da Vercel, pg_cron, rota agendada e mensagens de próxima
  execução foram removidos para a interface não prometer automação inexistente.

### BAIXO / não encontrado

- Não foram encontrados loops `useEffect` de busca, polling de poucos segundos,
  subscriptions Realtime vazando, listeners recorrentes ou inserts linha a
  linha no sync principal.
- Assets públicos são pequenos; o maior é o ícone de 512 px com ~86 KB.
- `@react-pdf/renderer` permanece somente na rota servidor de PDF e não entra no
  caminho normal do dashboard.

## Top 5 problemas mais graves

1. Meta bloqueando as páginas de conjuntos/anúncios.
2. Falta de isolamento por papel diante de leituras com `service_role`.
3. Janela fixa de 92 dias e payload de métricas de 778 KB.
4. Sincronização duplicada, sem lock/timeout e com histórico repetido.
5. Cache de HTML privado no service worker.

## Plano aplicado

1. Fechar isolamento e remover cache privado.
2. Reduzir a leitura ao período exato e medir linhas/bytes/requests.
3. Tirar Meta das páginas e criar snapshots/RPC no Supabase.
4. Tornar a sincronização incremental, em lotes e protegida contra concorrência.
5. Corrigir RLS/índice/função privilegiada.
6. Deduplicar autenticação e bundle de gráficos.
7. Rodar lint direcionado, TypeScript, build completo e segunda inspeção.

## Antes e depois

### Cenário padrão de métricas (30 dias + comparação anterior)

| Medida | Antes | Depois | Variação |
|---|---:|---:|---:|
| linhas | 1.924 | 984 | -48,9% |
| payload | 778.071 B | 398.908 B | -48,7% |
| requests paginados | 3 | 1 | -66,7% |
| tempo direto observado | 1.662 ms | 1.572 ms | -5,4%* |

\* A diferença de tempo isolada está dentro do ruído de rede e não é tratada
como ganho garantido. A redução de volume e round-trips é determinística.

Para “hoje”, a granularidade horária permanece correta e restrita: 22 linhas
diárias (8.918 B; 439 ms) e 308 horárias (124.328 B; 851 ms) na medição feita.

### Meta e bundle

| Medida | Antes | Depois |
|---|---:|---:|
| chamadas Meta ao abrir conjuntos/anúncios | > 0 | 0 |
| chunks de gráficos > 350 KB | 3 | 2 |
| soma bruta desses chunks | 1.150,5 KB | 751,8 KB |
| HTML/RSC privado no Cache Storage | sim | não |
| importação duplicada de campanhas por sync | sim | não |
| lock global de sincronização | não | sim |
| timeout por request Meta | não | 30 s |

### Build final

- Next.js 16.2.2: compilação concluída em 7,9 s na última execução aquecida.
- TypeScript: 10,0 s.
- 31 páginas geradas em 3,7 s.
- Build e pós-build concluídos com sucesso.
- Lint direcionado e `tsc --noEmit`: sem erros ou avisos.
- O lint global ainda acusa problemas em uma pasta paralela já existente,
  `Melhoria de layout e navegação`, fora do app auditado.

## Arquivos modificados pela auditoria

### Segurança/autenticação

- `src/proxy.ts`: validação por claims e propagação correta da sessão.
- `src/lib/auth/session.ts`: deduplicação por request.
- `src/lib/auth/supabase-auth.ts`: elimina `getUser()` no caminho de leitura.
- `src/app/admin/layout.tsx`, `src/app/dashboard/layout.tsx`: guardas por papel.
- `src/app/admin/campanhas/actions.ts`: autorização das Server Actions.
- `public/sw.js`, `src/components/service-worker-register.tsx`: somente assets
  públicos em cache.

### Dados e sincronização

- `src/lib/data/date-range.ts`: janela exata e comparação opcional.
- `src/lib/data/queries.ts`: projeções/cache e granularidade horária condicional.
- `src/lib/data/ad-levels.ts`: leitura de snapshots via RPC.
- `src/lib/meta-ads.ts`: timeout e insights diários de níveis.
- `src/lib/meta/accounts.ts`: controle correto de `last_synced_at`.
- `src/lib/sync/meta-sync.ts`: incremental, lotes, lock e snapshots.
- `src/app/api/sync-meta/route.ts`: remove importação duplicada.
- páginas de `campanhas/conjuntos` e `campanhas/anuncios`: Supabase-first.

### Frontend/bundle

- `src/components/dashboard/dashboard-chart.tsx`: boundary compartilhado.
- `src/components/dashboard/admin-overview.tsx` e
  `client-dashboard.tsx`: uso do boundary único.
- `admin-sync-panel.tsx` e `admin-campaigns-page.tsx`: comunicação coerente com
  a nova arquitetura.

### Banco

- `supabase/migrations/20260819171436_cache_meta_ad_levels.sql`: snapshots,
  índices e RPC agregada.
- `supabase/migrations/20260819172223_harden_rls_and_indexes.sql`: RLS, índice e
  restrição da função privilegiada.

## Limitações e próxima validação obrigatória

1. O projeto conectado pelo app Supabase nesta sessão não era o projeto
   `jqvwhonmtpopvldguiln` configurado no repositório. Por isso não foi possível
   aplicar migrações, executar `EXPLAIN ANALYZE`, `pg_stat_statements`, Index
   Advisor ou Database Advisors no banco correto.
2. Não havia uma sessão autenticada de teste nem automação de navegador
   disponível. TTFB autenticado, hydration, LCP e tempo até os dados aparecerem
   devem ser medidos após deploy com um usuário admin e um cliente de teste.
3. Vercel (`iad1`) e a região real do Postgres precisam ser comparadas no painel
   do Supabase. As latências diretas de 0,5–1,8 s justificam confirmar se há
   distância inter-regional, mas não provam sozinhas que a região é a causa.
4. A primeira sincronização manual após a migração faz backfill de até 92 dias e deve
   ser executada fora do horário de pico. Depois disso o dashboard já serve o
   snapshot salvo e as execuções seguintes reconciliam somente sete dias.

## Checklist de implantação

1. Confirmar backup e aplicar, nesta ordem, as duas migrações de 19/08/2026 no
   projeto Supabase correto.
2. Executar a primeira sincronização e conferir contagens por conta/campanha.
3. Confirmar os botões de atualização manual com um administrador e um cliente
   de teste, incluindo cooldown e mensagem de sucesso/erro.
4. Fazer deploy de preview e medir admin + cliente: TTFB, payload RSC, LCP,
   chamadas Supabase e ausência de chamadas Meta durante navegação.
5. Rodar advisors e `EXPLAIN (ANALYZE, BUFFERS)` para as consultas de métricas,
   permissões e RPC de níveis já com dados reais.
6. Só então promover para produção e acompanhar erros, 429/5xx da Meta, duração
   do job e hit rate de cache.
