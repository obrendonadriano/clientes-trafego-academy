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

## Publicação

1. Suba este projeto para um repositório Git.
2. Importe o repositório na Vercel.
3. Configure as variáveis de ambiente da produção.
4. Aponte o domínio `dashboard.trafegoacademy.online` para o projeto da Vercel.
5. Use as URLs públicas abaixo em integrações como Meta:

```text
https://dashboard.trafegoacademy.online/politica-de-privacidade
https://dashboard.trafegoacademy.online/termos-de-servico
https://dashboard.trafegoacademy.online/exclusao-de-dados
```
