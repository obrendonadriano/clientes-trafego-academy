# Conversões: WhatsApp Business oficial e Conversions API

Esta área deixou de depender de WAHA e de n8n. O WAHA continua existindo e
funcionando no **Atendimento por IA**, que é outro produto, com outro plano e
outro fluxo. Os dois convivem sem um depender do outro.

## Fluxo

```text
Meta Ads (conta da Tráfego Academy)
  -> anúncio Click-to-WhatsApp
  -> WhatsApp Business do cliente (mesmo número, mesmo app no celular)
  -> webhook oficial da Cloud API        POST /api/whatsapp/meta-webhook
  -> tenant resolvido pelo phone_number_id/waba_id cadastrado
  -> lead criado com ctwa_clid           coluna conversion_leads.ctwa_clid
  -> Kanban de Conversões                3 etapas
  -> fila private.conversion_events      um evento por marco
  -> worker da aplicação                 src/lib/conversions/dispatcher.ts
  -> Conversions API                     POST /{dataset_id}/events
```

Não há n8n em nenhum ponto deste caminho, e nenhuma chamada ao WAHA.

## Funil

| Etapa | Evento | Como sai | Quando acontece |
| --- | --- | --- | --- |
| Novos leads | `LeadSubmitted` | `business_messaging`, `messaging_channel: whatsapp`, `ctwa_clid` + `whatsapp_business_account_id` | Automático, na chegada do webhook |
| Qualificados | `QualifiedLead` | idem, com **o mesmo** `ctwa_clid` original | Cliente arrasta o cartão |
| Veículos comprados | `VehicleAcquired` | `action_source: other`, telefone normalizado em SHA-256 (`ph`) | Cliente arrasta o cartão |

`Desqualificado` saiu do produto. O valor do enum continua no banco e as linhas
históricas continuam existindo; o gatilho recusa qualquer transição **nova** para
essa etapa e a interface não a mostra. Nada foi apagado.

### Por que `VehicleAcquired` é diferente

A Conversions API de Business Messaging aceita uma lista fechada de eventos
(`Purchase, LeadSubmitted, InitiateCheckout, AddToCart, ViewContent,
OrderCreated, OrderShipped, OrderDelivered, OrderCanceled, OrderReturned,
CartAbandoned, QualifiedLead, RatingProvided, ReviewProvided`). **Evento
personalizado não é aceito nesse canal.** Como `VehicleAcquired` é
personalizado — e o fechamento acontece por contrato, fora da conversa — ele sai
como evento server-side comum, com `action_source: other` e correspondência por
telefone. É o mesmo Dataset do cliente; o que muda é o contexto do evento.

`Purchase` não é usado: o dinheiro representa o que a empresa **pagou** para
adquirir o veículo, não receita gerada pelo consumidor.

**Confirmado:** `VehicleAcquired` é um **evento personalizado** (custom event),
não um evento padrão da Meta. Ele não existe no catálogo da Meta e não deve ser
tratado como se existisse. Consequências práticas:

- Vai pela **Conversions API server-side comum**, com `action_source: "other"`,
  para o mesmo Dataset do cliente — **nunca** com `action_source:
  "business_messaging"`, que só aceita a lista fechada acima. O código recusa
  essa combinação em `buildServerEvent`, com teste cobrindo.
- Como evento personalizado, ele **não aparece sozinho** como opção de
  otimização no Gerenciador de Anúncios. Para usá-lo em campanha é preciso
  criar a **conversão personalizada** correspondente no Gerenciador de Eventos,
  a partir do Dataset daquele cliente.
- `events_received = 1` significa apenas que a Meta **recebeu** o evento. Não
  garante atribuição à campanha nem habilita otimização automaticamente.
- A correspondência é por telefone em SHA-256 (`ph`), sem `ctwa_clid` — porque
  o fechamento ocorre fora da conversa. Isso tende a atribuir menos do que os
  eventos de mensagem, e é esperado.

### O que nunca é enviado à Meta

Valor pago, dívida, parcelas, condição financeira, placa, RENAJUD, dados do
veículo, informações jurídicas e observações internas. O payload de mensagens
leva só `ctwa_clid` + WABA; o de aquisição leva só o telefone em hash. Há teste
automatizado para isso (`tests/conversion-payload.test.mjs`).

O valor pago continua no CRM, é **opcional** e não é exigido para mover o cartão.

## Isolamento entre clientes

A conta de anúncios é uma só, da Tráfego Academy. Os sinais, não.

```text
Tráfego Academy  -> conta de anúncios da agência (meta_ad_accounts)
  LS Motors  -> WABA LS  -> phone_number_id LS  -> Dataset LS
  GA Motors  -> WABA GA  -> phone_number_id GA  -> Dataset GA
```

`public.client_whatsapp_connections` tem índice único em `waba_id`,
`phone_number_id` e `dataset_id`, e a RPC de onboarding recusa explicitamente um
WhatsApp já vinculado a outro cliente. Não existe Dataset genérico
compartilhado.

**O Dataset não é criado quando o cliente é cadastrado.** Ele é resolvido no
momento em que o cliente conecta o WhatsApp, por `POST /{WABA_ID}/dataset` —
endpoint que a Meta documenta como idempotente: se já existir um Dataset para
aquele WABA, ele devolve o mesmo id. Descobrir e criar são a mesma chamada, e
reconectar nunca gera um segundo Dataset.

### Vínculo com a conta de anúncios

A documentação da Meta afirma que *"attribution is based on the page/dataset id
and is not related to the app id"*. Não há, hoje, endpoint oficial para
"compartilhar" o Dataset de mensagens com uma conta de anúncios, e nenhum é
necessário para a atribuição funcionar. Por isso o sistema **não** inventa essa
chamada. `META_AD_ACCOUNT_ID` existe só como configuração central de
diagnóstico.

## Segurança

- O código do Embedded Signup é trocado por token **no servidor**. O navegador
  nunca vê `app_secret` nem token.
- O token do cliente é cifrado com AES-256-GCM (`META_CREDENTIALS_KEY`) e
  gravado em `private.client_whatsapp_credentials`, fora do alcance da API
  pública e da RLS. Tokens do cadastro manual antigo continuam válidos até o
  cliente reconectar.
- O webhook valida `X-Hub-Signature-256` (HMAC SHA-256 com o app secret) e
  responde 401 sem ela.
- O tenant vem sempre do `phone_number_id`/`waba_id` cadastrado. **Um
  `client_id` recebido no payload nunca é aceito.**
- Mensagem orgânica não vira lead: sem `referral.ctwa_clid` o webhook só
  registra que a integração está viva.
- Idempotência por `wa_message_id` e por `ctwa_clid`, ambos com índice único.
  Telefone sozinho nunca é chave de deduplicação.

## Fila de envio

`private.conversion_events` guarda um evento por marco, com `event_id`
determinístico (`cl_<lead>_<evento>`), horário próprio, tentativas, resposta
resumida e próxima tentativa.

- Reserva atômica com `SKIP LOCKED`: duas execuções não enviam o mesmo evento.
- Marco já confirmado não é reenviado quando o cartão volta e avança de novo.
- `event_time` original nunca é substituído por "agora". Evento com mais de 7
  dias (limite da Meta) é sinalizado, não rejuvenescido.
- Só `events_received >= 1` conta como enviado.
- Limite de requisições é retentável com espera crescente. **Timeout, 5xx e
  reserva vencida não são**: a Meta pode ter recebido, e a deduplicação de
  Business Messaging é responsabilidade da integração. Esses casos vão para
  conciliação manual no Gerenciador de Eventos.

O worker roda em três momentos: depois de um lead novo chegar pelo webhook,
depois de mover um cartão (via `after()`, sem segurar a resposta) e pelo cron
`POST /api/conversions/dispatch`, protegido pela `SYNC_SECRET_KEY`.

Agende o cron a cada 5 minutos. Ele é a rede de segurança — sem ele nada se
perde, só atrasa.

## O que ficou pendente com você

O código está completo. O que falta é o que só pode ser feito no painel da Meta.

### 1. App da Meta

Em <https://developers.facebook.com/apps> use o app que já existe (o mesmo do
Meta Ads) ou crie um do tipo **Business**. Adicione o produto **WhatsApp**.

Anote **App ID** e **App Secret** (Configurações → Básico).

### 2. Verificação do negócio e Tech Provider

Business Manager → Central de Segurança: conclua a **verificação do negócio**.
Sem ela o onboarding fica limitado a 10 clientes a cada 7 dias; com ela e com a
**Access Verification**, sobe para 200. O app precisa estar habilitado como
**Tech Provider** (ou usar um Solution Partner).

### 3. Permissões e App Review

As permissões se dividem em dois grupos com finalidades diferentes. Confundi-los
é o erro mais caro aqui: dá para conectar o WhatsApp com sucesso e mesmo assim
ter **todos** os eventos recusados depois.

#### Grupo A — onboarding e recebimento de leads

Sem estas, o botão "Conectar WhatsApp Business" não conclui e o webhook não
entrega nada.

| Permissão | Para quê, neste projeto | Acesso |
| --- | --- | --- |
| `whatsapp_business_management` | Ler o WABA do cliente, listar `phone_numbers` (com `is_on_biz_app`/`platform_type`) e assinar o webhook em `subscribed_apps`. É ela que aparece em `granular_scopes` e prova qual WABA foi autorizado. | **Avançado** |
| `whatsapp_business_messaging` | Exigida pelo Embedded Signup para o número do cliente. A dashboard **não envia mensagens**, mas a permissão faz parte do onboarding. | **Avançado** |
| `business_management` | Ler o negócio dono do WABA (`owner_business_info`) e os ativos compartilhados com a agência. | **Avançado** |

Evidências pedidas no App Review (uma gravação **separada** por permissão):

- `whatsapp_business_management`: vídeo criando um template de mensagem.
- `whatsapp_business_messaging`: vídeo de uma mensagem saindo do app e chegando
  no WhatsApp.
- `business_management`: descrição escrita do uso dos ativos do cliente.

#### Grupo B — envio dos eventos de conversão

Sem esta, o onboarding funciona, o lead aparece no Kanban e **nenhum evento é
aceito pela Meta**.

| Permissão | Para quê | Acesso |
| --- | --- | --- |
| `whatsapp_business_manage_events` | Resolver o Dataset (`POST /{WABA_ID}/dataset`) e enviar `LeadSubmitted`/`QualifiedLead` pela Conversions API de Business Messaging. | **Avançado** |

**Boa notícia:** a documentação de App Review para provedores diz que
`whatsapp_business_manage_events` é **aprovada automaticamente quando o app já
tem acesso avançado a `whatsapp_business_messaging`**. Ou seja, ela normalmente
não é um segundo processo de revisão — mas confirme no painel que ela aparece
como concedida antes de ligar o envio.

> Correção em relação à primeira versão deste documento: ela foi descrita ali
> como exigindo um App Review próprio. A referência oficial indica aprovação
> automática a partir de `whatsapp_business_messaging`.

#### Pré-requisitos do app

- **Verificação do negócio** concluída no Business Manager.
- **Tech Provider** (ou parceria com um Solution Partner, que exige linha de
  crédito).
- Enquanto a verificação do negócio e a **Access Verification** não estiverem
  concluídas, o onboarding fica limitado a **10 clientes a cada 7 dias**; com
  elas, sobe para **200**.
- O servidor que hospeda o Embedded Signup precisa de SSL válido.
- Como app usado por **outros** negócios, o acesso avançado é obrigatório. (Se
  fosse uso próprio como Direct Developer, não seria — não é o caso aqui.)

### 4. Embedded Signup com Coexistence

No app: **WhatsApp → Embedded Signup → Criar configuração**.

Ative o onboarding de usuários do **aplicativo WhatsApp Business**
(Coexistence). O código já envia `featureType: "whatsapp_business_app_onboarding"`
e `sessionInfoVersion: 3`; a configuração precisa permiti-lo.

Anote o **Configuration ID**.

Em **Configurações → Básico → Domínios do app** e em **Login do Facebook →
Configurações**, inclua o domínio da dashboard
(`https://dashboard.trafegoacademy.online`).

O cliente precisa estar com o **WhatsApp Business 2.24.17 ou superior** no
celular. Números em coexistência têm taxa fixa de 20 mensagens por segundo — o
que não afeta Conversões, que não envia mensagens.

### 5. Webhook

No app: **WhatsApp → Configuração → Webhooks**.

- URL de callback: `https://dashboard.trafegoacademy.online/api/whatsapp/meta-webhook`
- Token de verificação: o mesmo valor de `META_WEBHOOK_VERIFY_TOKEN`
- Assinar o campo **`messages`**

A rota já responde ao desafio `hub.challenge`. A assinatura por WABA é feita
automaticamente no onboarding (`POST /{WABA_ID}/subscribed_apps`).

#### Atribuição de anúncios — o item que silenciosamente quebra tudo

Caminho: **WhatsApp Manager** (<https://business.facebook.com/wa/manage/>) →
selecione a **conta do WhatsApp Business (WABA) do cliente** → **Configurações
da conta** (*Account settings*) → seção **Atribuição de anúncios** (*Ads
attribution*) → deixar **ativada**.

Precisa ser feito **uma vez por WABA**, ou seja, uma vez por cliente.

Sem esse toggle a Meta **não inclui o objeto `referral` no webhook**. Sem
`referral` não há `ctwa_clid`; sem `ctwa_clid` o lead não é criado (por
desenho — veja "Mensagens orgânicas") e nenhuma conversão de mensagens pode ser
atribuída. O sintoma é cruel: tudo parece conectado e o Kanban fica vazio.

Para conferir se está valendo: mande uma mensagem por um anúncio
Click-to-WhatsApp real e veja se o cartão aparece em **Novos leads**. Se o
webhook chega (o painel admin mostra "Último webhook") mas nenhum lead é criado,
o toggle é o primeiro lugar a olhar.

> Este é o único item deste checklist que não consegui confirmar numa página da
> documentação oficial da Meta — ele aparece descrito em documentação de
> provedores e no próprio painel. Confirme o rótulo exato na interface, que a
> Meta renomeia de tempos em tempos.

### 6. Variáveis de ambiente

Na Vercel (ou onde a dashboard roda):

```bash
META_APP_ID=<App ID do passo 1>
META_APP_SECRET=<App Secret do passo 1>
META_EMBEDDED_SIGNUP_CONFIG_ID=<Configuration ID do passo 4>
META_WEBHOOK_VERIFY_TOKEN=<valor aleatório longo, igual ao do passo 5>
META_CREDENTIALS_KEY=<openssl rand -base64 32>
META_GRAPH_VERSION=v26.0
META_AD_ACCOUNT_ID=act_<conta da Tráfego Academy>
```

`META_CREDENTIALS_KEY` precisa ter exatamente 32 bytes em base64. **Se ela for
trocada, os tokens já gravados deixam de ser legíveis** e os clientes precisarão
reconectar.

### 7. Migração do banco

Aplique `supabase/migrations/20260924210000_official_whatsapp_conversions.sql`
no projeto correto, depois das anteriores, numa transação. Ela:

- cria `client_whatsapp_connections` e `private.client_whatsapp_credentials`;
- acrescenta a procedência oficial em `conversion_leads`;
- troca as assinaturas de `capi_fetch_queue` e `admin_client_capi_status`;
- **remove `waha_ingest_lead`** e apaga `leads_webhook_url` da config do WAHA;
- avisa (sem falhar) se houver `ctwa_clid` duplicado no histórico.

Publique a dashboard junto. Antes de aplicar, **pause o workflow antigo de CAPI
no n8n** e aguarde as execuções em andamento; o de Atendimento IA continua
ativo.

### 8. Cron

Agende a cada 5 minutos:

```bash
curl -fsS -X POST https://dashboard.trafegoacademy.online/api/conversions/dispatch \
  -H "x-sync-key: $SYNC_SECRET_KEY"
```

### 9. Ordem de implantação

A ordem importa. Cada passo depende do anterior, e o envio real à Meta é o
**último** a ser ligado — de propósito.

| # | Passo | Onde | Como saber que deu certo |
| --- | --- | --- | --- |
| 1 | App, verificação do negócio, Tech Provider, App Review (passos 1–3) | Meta | Permissões dos grupos A e B aparecem como concedidas |
| 2 | Configuração do Embedded Signup com Coexistence (passo 4) | Meta | Você tem o Configuration ID |
| 3 | Atribuição de anúncios ativada **em cada WABA** | WhatsApp Manager | Toggle ligado por cliente |
| 4 | Variáveis de ambiente, com `CONVERSIONS_DISPATCHER_ENABLED=false` | Vercel | Deploy sobe sem erro |
| 5 | Migração `20260924210000` | Supabase (**staging primeiro**) | Roda sem erro; `select conversion_pipeline_version()` = 3 |
| 6 | Deploy da aplicação | Vercel | Admin → Integração com o Meta sem aviso de pendência |
| 7 | Webhook cadastrado e campo `messages` assinado (passo 5) | Meta | O desafio `hub.challenge` é aceito |
| 8 | Teste do Embedded Signup com um número elegível | Dashboard | "Conectado" + "Rastreamento ativo"; `Coexistence: Ativo` no admin |
| 9 | Confirmar que o número **continua funcionando no app do celular** | Celular | Conversas normais, nada mudou |
| 10 | Teste real de `ctwa_clid`: clicar num anúncio e mandar a 1ª mensagem | Anúncio real | Cartão em **Novos leads** com o anúncio identificado |
| 11 | Test Events da Meta: conferir os 3 payloads | Gerenciador de Eventos | Sem valor, sem dívida, sem placa, sem observação |
| 12 | **Ligar o envio**: `CONVERSIONS_DISPATCHER_ENABLED=true` + cron | Vercel | `LeadSubmitted` chega no Dataset **daquele** cliente |
| 13 | Conferir isolamento: o Dataset de outro cliente não recebeu nada | Gerenciador de Eventos | Zero eventos cruzados |
| 14 | **Só então** desligar o n8n antigo de Conversões | n8n | Leads continuam chegando pelo webhook oficial |

Testes negativos que valem a pena rodar no passo 10: mande uma mensagem
**orgânica** de outro número e confirme que **não** cria cartão.

O workflow de Atendimento IA do n8n **não** entra nesta lista: ele não é
tocado em nenhum passo e continua ativo o tempo todo.

#### Por que o envio fica desligado até o passo 12

Com `CONVERSIONS_DISPATCHER_ENABLED` diferente de `true`, a fila **acumula** os
eventos com as datas originais e não envia nada. Isso permite aplicar a
migração, publicar a aplicação e testar o Embedded Signup sem que um único
evento vá para a Meta.

Atenção a uma consequência real: a Meta recusa eventos com mais de **7 dias**.
Um evento que ficar parado além disso é marcado como fora da janela e **não é
rejuvenescido** — a data original é preservada. Se a validação for demorar mais
de uma semana, prefira validar em staging com dados de teste.

## Migração e histórico

Conversões antigas já enviadas são preservadas e **não são reenviadas**. Nenhum
evento é inventado para completar histórico. Leads antigos continuam no Kanban;
os que estavam em `desqualificado` permanecem no banco, fora da interface.

A configuração manual de Dataset/WABA/token no perfil do cliente continua
funcionando como saída de emergência do administrador: a fila aceita a
credencial antiga enquanto o cliente não reconectar pelo fluxo oficial.

## Testes

```bash
npm run test:conversions
```

Executa o SQL real das migrações em PostgreSQL (PGlite) e cobre: as três etapas,
idempotência do webhook repetido, o não-reenvio de marco confirmado ao mover o
cartão para trás e para frente, mensagem orgânica, isolamento entre clientes,
Dataset único por cliente, reconexão sem duplicar Dataset, preservação de datas,
conciliação de resposta ambígua e ausência de dados sensíveis no payload.

Os testes não enviam nada à Meta e não tocam em dados de produção. Os itens que
exigem serviços reais — conexão de um número elegível, Coexistence no celular e
o comportamento do Atendimento IA com o WAHA ligado — estão no roteiro de
validação acima.

## Referências oficiais consultadas

- [Onboard WhatsApp Business app users (Coexistence)](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)
- [Embedded Signup: implementação](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation)
- [Conversions API para Business Messaging](https://developers.facebook.com/docs/marketing-api/conversions-api/business-messaging/)
- [Parâmetros do evento de servidor (`action_source`, `event_time`, dedupe)](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event/)
- [Parâmetros de correspondência (`ph`, `ctwa_clid`)](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters/)
