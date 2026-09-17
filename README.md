# Tráfego Academy Dashboard

Portal privado separado do site institucional da Tráfego Academy.

## Stack

- Next.js
- TypeScript
- Tailwind CSS
- componentes no padrão shadcn/ui
- Supabase preparado
- Recharts

## Fluxo atual do MVP

- `/login` é a porta de entrada
- não existe cadastro público
- `admin / admin` funciona apenas em desenvolvimento
- clientes mockados podem usar `ana / cliente123` e `bruno / cliente123`
- `proxy` protege o fallback local e as páginas fazem guarda de sessão no servidor
- com Supabase configurado, o login aceita `username` ou `email`
- o admin já possui formulários para criar cliente, campanha, conta e permissão

## Produção futura

- app pensada para subir em `dashboard.trafegoacademy.online`
- variáveis de ambiente já separadas
- schema inicial do Supabase em `supabase/schema.sql`
- integração Gemini preparada em `src/lib/services/gemini.ts`
- páginas públicas para publicação:
  - `/`
  - `/politica-de-privacidade`
  - `/termos-de-servico`
  - `/exclusao-de-dados`

## Como ligar o Supabase

1. Crie o projeto no Supabase.
2. Rode o SQL de `supabase/schema.sql`.
3. Preencha `.env.local` com base em `.env.example`.
4. Crie manualmente o primeiro usuário admin no Supabase Auth.
5. Insira esse admin na tabela `public.users` com `role = 'admin'` e `auth_user_id` apontando para o usuário auth.
6. Depois disso, o painel admin já consegue criar contas de clientes e vincular campanhas.

## Rodando localmente

```bash
npm install
npm run dev
```

## Produção na VPS

1. Clone o projeto na VPS em `/var/www/trafegoacademy-dashboard`.
2. Instale Node.js 20+, PM2 e Nginx.
3. Crie o arquivo `.env.production` com as variáveis do projeto.
4. Rode `npm install` e `npm run build`.
5. Suba o app com `pm2 start ecosystem.config.js`.
6. Configure o Nginx com [deploy/nginx-dashboard.conf](D:/Downloads%20C/TrafegoAcademy-projetos/trafegoacademy-dashboard/deploy/nginx-dashboard.conf).
7. Aponte o DNS do subdomínio `dashboard.trafegoacademy.online` para a VPS.
8. Gere o SSL com Certbot.
9. Use as URLs públicas abaixo em integrações como Meta:

```text
https://dashboard.trafegoacademy.online/politica-de-privacidade
https://dashboard.trafegoacademy.online/termos-de-servico
https://dashboard.trafegoacademy.online/exclusao-de-dados
```

## Atualização manual da Meta Ads

- não existe cron ou atualização automática;
- administradores usam **Atualizar dados da Meta**;
- clientes usam **Atualizar métricas** quando precisarem dos números mais recentes;
- `public.sync_statuses` guarda somente a última tentativa, o último sucesso e
  o estado atual para impedir execuções simultâneas.

## Conversões de leads por WhatsApp

- **Desqualificado** é uma etapa interna do dashboard; a Conversions API para
  mensagens não oferece um evento negativo equivalente e nada é enviado.
- **Qualificado** coloca `QualifiedLead` na fila da Meta quando o lead possui
  `ctwa_clid`.
- **Negócio fechado** exige o valor da venda e coloca `Purchase` na fila com
  `currency: BRL` e `value`.
- O workflow importável e atualizado está em
  `n8n/n8n_capi_conversoes.json`.

## Planos dos clientes

`public.clients.plan_type` define o que o cliente enxerga:

- **Essencial** (`essential`, padrão) — todas as funções atuais. A área
  **Atendimento IA** aparece no menu, mas esmaecida, sem clique e com o convite
  de upgrade.
- **Completo** (`complete`) — libera ativação da IA, prompt, WhatsApp de
  notificação, configurações, histórico e leads qualificados.

O campo está no cadastro e na edição do cliente (Admin → Clientes). Rebaixar
para Essencial **desativa a IA na hora** e preserva prompt, número de
notificação e todo o histórico; voltar para Completo é só religar.

O bloqueio não é visual. Ele é aplicado em três camadas:

1. a tela do Plano Essencial é `inert` (sem foco, sem clique, fora do tab);
2. toda server action da área revalida sessão, papel, tenant e plano;
3. um trigger no Postgres recusa `ai_agent_settings.enabled = true` quando o
   plano não é Completo — vale inclusive para a `service_role`.

## Atendimento e qualificação por IA no WhatsApp

Usa a **mesma sessão WAHA** que o cliente já conecta em Conversões. Não há
segunda integração de WhatsApp, nem novo QR, nem nova credencial.

```text
Anúncio -> lead chama o WhatsApp Business do cliente
  -> WAHA dispara o evento "message"
  -> n8n (debounce e esperas)  ->  dashboard (toda a regra)
        plano Completo? IA ligada? sessão WORKING? não é fromMe?
        -> carrega prompt do cliente + histórico + dados já coletados
        -> DeepSeek devolve JSON (resposta + dados extraídos + status)
        -> quebra em mensagens curtas, "digitando..." e delay sorteado
        -> envia pela MESMA sessão WAHA
        -> lead qualificado: avisa o WhatsApp pessoal do cliente (uma vez só)
```

Tabelas: `ai_agent_settings` (config por cliente), `ai_conversations` (lead e
dados coletados) e `ai_messages` (histórico completo). O estado vive no banco,
então reiniciar o servidor não perde contexto nem duplica resposta.

Proteções implementadas:

- **Idempotência** — `ai_messages.provider_message_id` é único; webhook
  repetido não gera segunda resposta.
- **Loop** — mensagens `fromMe`, de grupos e do próprio número de notificação
  nunca viram lead.
- **Concorrência** — `ai_claim_conversation` reserva a conversa; o relógio do
  envio é `typing_started_at`, então nenhuma mensagem sai antes da hora mesmo
  com dois fluxos disparados.
- **Notificação única** — `notification_sent` é marcado antes do envio.
- **Atendimento humano** — `human_takeover` para a IA; o botão "Retomar IA"
  devolve a conversa para a automação.

Configuração: Admin → Configurações → **DeepSeek** (modelo e API Key) e
**WhatsApp (WAHA)** → webhook do Atendimento IA. O workflow do n8n está em
`n8n/n8n_waha_atendimento_ia.json`.

### Onde o cliente conecta o WhatsApp

A aba **Conversões** é área do admin. O cliente não a vê no menu e a rota
`/dashboard/conversoes` redireciona para `/dashboard/atendimento-ia`.

A conexão do WhatsApp (onboarding, QR, status e desconectar) mudou de casa e
agora envolve a página **Atendimento IA** — é a mesma sessão WAHA de sempre,
o mesmo componente, sem QR novo. Enquanto não houver conexão, a página mostra
o onboarding; conectado, aparece a barra de status e o conteúdo da IA.

Isso vale para os dois planos: o cliente **Essencial também conecta**, porque o
pipeline de leads/CAPI depende dessa sessão. O que ele vê bloqueado é só a
área de IA, abaixo da barra de status.

### Migração

```bash
# aplique no Supabase do projeto
supabase/migrations/20260916120000_ai_agent_whatsapp.sql
```
