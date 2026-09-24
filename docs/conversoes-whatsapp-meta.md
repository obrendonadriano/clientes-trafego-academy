# Conversões de veículos: diagnóstico e ativação

## O que foi verificado

Na consulta ao banco conectado em 23/09/2026 (horário de São Paulo): 34 clientes,
2 com CAPI ativa e IDs/token cadastrados, 211 leads pendentes e 10 desqualificados.
Nenhum lead estava marcado como enviado. Das 30 sessões WhatsApp cadastradas,
29 estavam `NAO_CRIADA` e uma `STOPPED`. Esses são estados registrados no banco;
não comprovam por si só o estado atual do servidor WAHA ou dos workflows n8n.

O cliente era redirecionado de Conversões para Atendimento IA e não tinha essa
opção no menu. A entrada de contatos depende de WAHA + n8n e atualmente filtra
mensagens com referência de anúncio. Não captura automaticamente todo contato
orgânico do WhatsApp. Conectar a conta de anúncios Meta não conecta o WhatsApp.

## Funil e eventos

| Etapa | Evento | Origem e correspondência |
| --- | --- | --- |
| Novo lead de anúncio | `LeadSubmitted` | `business_messaging`, canal `whatsapp`, `ctwa_clid` e WABA |
| Lead dentro do perfil | `QualifiedLead` | Os mesmos identificadores do anúncio/conversa |
| Desqualificado | Nenhum evento negativo | Controle interno; cancela marcos ainda não reservados para envio |
| Veículo comprado após contrato | `VehicleAcquired` (personalizado) | `other`, telefone em formato internacional com hash SHA-256 |

O usuário confirmou que o fechamento ocorre **fora do WhatsApp, após contrato**.
Por isso não enviamos `Purchase` de mensagens. `other` representa o fechamento
contratual fora dos canais especificados; se o processo for definido como ocorrido
na loja física, ajustar para `physical_store` e validar esse caminho no dataset.
O valor pago pelo veículo é custo de aquisição, fica no CRM e não é enviado como
receita. O payload não inclui observação, dívida, parcelas, condição financeira,
placa ou informações do veículo.

O evento personalizado é a recomendação de modelagem para este negócio, não um
evento padrão de compra de veículos da Meta. Criar/verificar a conversão
personalizada correspondente no Gerenciador de Eventos e confirmar sua
disponibilidade no objetivo/conjunto de anúncios antes de otimizar por ela.
Um evento aceito (`events_received = 1`) não garante atribuição à campanha nem
habilita automaticamente uma opção de otimização. A aquisição fora da conversa
usa correspondência por telefone; não transporta `ctwa_clid` como se fosse um
evento de mensagens. Essa atribuição pode ser inferior à correspondência direta
dos eventos de mensagem.

## Mudanças no projeto

- Kanban para administrador e cliente, com arrastar, seletor acessível no celular,
  confirmação de compra e valor pago. Até 50 registros por etapa em cada página;
  a contagem mostra o total do período, e a navegação percorre as páginas das etapas.
- Conexão WhatsApp disponível em Conversões independentemente do plano de IA.
  O Kanban continua acessível enquanto a conexão estiver offline.
- Ações exigem sessão real, aplicam RLS/filtro do cliente e verificam linhas
  alteradas. Uma sessão mock não altera leads reais.
- `private.conversion_events` guarda cada marco com horário e resultado próprios.
  Uma mudança rápida para fechamento não sobrescreve a qualificação.
- Um lead gera no máximo um evento de cada tipo. Reclassificar um evento já
  confirmado não o reenvia. Eventos em andamento não são anulados pelo Kanban.
- Datas originais são preservadas. Eventos com mais de sete dias são sinalizados,
  nunca rejuvenescidos. Retentativas só ocorrem após rejeição temporária explícita;
  timeout, resposta ambígua e reserva vencida exigem conciliação manual.
- O workflow recebe o evento pronto, não envia custos como receita, não salva
  payloads de execução e só confirma sucesso quando a Meta acusa recebimento.

A migração preserva resultados antigos já enviados. **Não reenvia o histórico
automaticamente** nem tenta reconstruir etapas que o modelo antigo sobrescreveu.
Leads antigos pendentes entram no novo controle ao serem reclassificados ou
receberem um identificador de clique; a entrada original preserva a data de criação
e pode já estar fora da janela de envio. Reprocessar histórico requer revisão dos
eventos reais e de suas datas.

## Ativação coordenada

Os arquivos locais não ativam o banco, o n8n nem o aplicativo Meta em produção.

1. Pausar o workflow CAPI antigo e aguardar as execuções em andamento. Ele
   interpreta fechamentos como `Purchase` de mensagens e é incompatível com a
   nova fila. Manter a ingestão de leads funcionando.
2. Aplicar `20260924020710_conversion_event_outbox.sql` no projeto correto, após
   as migrações anteriores, em uma transação. A migração altera a assinatura das
   RPCs da fila. Publicar a dashboard junto com essa atualização.
3. Importar o novo `n8n/n8n_capi_conversoes.json`, selecionar a credencial Supabase
   com acesso de serviço e conferir o endereço do projeto em todos os nós HTTP.
   Se os arquivos em `n8n/code` forem editados, executar
   `node scripts/sync-capi-workflow.mjs` antes de importar o JSON.
4. Por cliente, conferir dataset apropriado, WABA, token com permissão e CAPI
   ativa. Para `VehicleAcquired`, confirmar que o dataset/token aceita eventos
   fora de mensagens. Não presumir que um dataset vinculado ao WABA esteja
   automaticamente configurado para todo caso de uso.
5. Conectar o WhatsApp e validar que a ingestão está ativa. Receber um contato
   de anúncio controlado e conferir `ctwa_clid`, cliente correto e telefone
   internacional. Não usar conversões fictícias em dados de produção.
6. Usar o código de teste do Gerenciador de Eventos em um workflow de teste
   separado (`test_event_code` no corpo da requisição). Conferir os payloads das
   três etapas e a ausência de custo/observação/dados financeiros. O workflow
   de produção entregue não contém código de teste.
7. Confirmar recebimento no dataset correto, qualidade de correspondência,
   isolamento entre clientes e disponibilidade da conversão no Gerenciador de
   Anúncios. Só então ativar o agendamento de produção.

Se uma reserva ou envio ficar sem confirmação, verificar o `event_id` no
Gerenciador de Eventos e nos registros disponíveis antes de liberar reenvio.
Não zerar tentativas automaticamente: a Meta documenta que a deduplicação de
eventos de Business Messaging deve ser feita pela integração.

## WhatsApp Business com menos dependências

O QR existente usa **WAHA**, não o onboarding oficial da Cloud API. Ele continua
disponível nesta entrega; a migração para API oficial não foi implementada.

A opção recomendada é **WhatsApp Business App Coexistence**: o cliente mantém o
mesmo número no aplicativo e conecta a Cloud API por Embedded Signup. As
mensagens elegíveis chegam por webhook oficial, e a primeira mensagem vinda do
anúncio pode fornecer `referral.ctwa_clid`. Etiquetas do aplicativo não substituem
o Kanban nem constituem uma integração automática de conversões.

Para implementar esse próximo conector é necessário escolher entre um provedor
habilitado e um aplicativo próprio habilitado como Tech Provider/Solution Partner,
verificar elegibilidade do número, permissões e onboarding. O trabalho inclui:

1. Embedded Signup e troca de código por token exclusivamente no servidor.
2. Vínculo de `phone_number_id`/WABA ao cliente, com credenciais privadas.
3. Webhook com verificação de assinatura, deduplicação por mensagem e roteamento
   pelo número/WABA cadastrado; nunca pelo `client_id` informado no payload externo.
4. Captura do anúncio e encaminhamento ao mesmo funil/fila de eventos.
5. Teste com um número elegível e confirmação de que o aplicativo continua ativo.

## Validação local

`npm run test:conversions` executa o SQL real da migração em PostgreSQL via PGlite,
com o gatilho de proteção anterior, e testa os programas incorporados no workflow.
Os testes cobrem preservação de marcos, cancelamento antes do envio,
deduplicação interna, resposta tardia, datas vencidas, retentativa explícita,
identificadores distintos por canal e permissões entre clientes.

O navegador foi verificado com dados sintéticos e o Supabase desabilitado no
processo de desenvolvimento. Os testes não enviaram conversões à Meta e não
alteraram leads de clientes. A confirmação real de recepção permanece pendente.

## Referências oficiais consultadas

- [CAPI para Business Messaging: eventos, identificadores e canais](https://developers.facebook.com/docs/marketing-api/conversions-api/business-messaging/)
- [Parâmetros de evento: eventos personalizados, action_source e event_time](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event/)
- [Conversões fora do ambiente online](https://developers.facebook.com/docs/marketing-api/conversions-api/offline-events/)
- [WhatsApp Business App Coexistence: requisitos e onboarding](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/)
