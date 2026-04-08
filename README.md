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
3. Crie o arquivo `.env.production` com as variáveis do projeto, incluindo `CRON_SECRET`.
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

## Sincronização automática da Meta Ads

- a rota `/api/cron/meta-sync` continua protegida por `CRON_SECRET`
- o agendamento de 15 minutos pode ser feito direto na VPS com cron chamando [deploy/meta-sync.sh](D:/Downloads%20C/TrafegoAcademy-projetos/trafegoacademy-dashboard/deploy/meta-sync.sh)
- você também pode usar o [supabase/meta-sync-cron.sql](D:/Downloads%20C/TrafegoAcademy-projetos/trafegoacademy-dashboard/supabase/meta-sync-cron.sql) se preferir manter o agendamento no Supabase
- troque `COLE_SEU_CRON_SECRET_AQUI` pelo mesmo valor definido no `.env.production`
- rode novamente `supabase/schema.sql` para criar a tabela `public.sync_statuses`
- a área do cliente exibe a última e a próxima atualização com base nesse status

### Exemplo de cron na VPS

```bash
*/15 * * * * APP_URL=https://dashboard.trafegoacademy.online CRON_SECRET=seu_segredo /var/www/trafegoacademy-dashboard/deploy/meta-sync.sh >> /var/log/trafegoacademy-meta-sync.log 2>&1
```
