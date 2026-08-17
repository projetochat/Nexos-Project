# MRC-03 - Messaging Product Completion

Data: 2026-08-12

## Objetivo

Finalizar pontos funcionais de produto sobre a base estabilizada da mensageria:

- Atualizacao realtime de reacoes recebidas do WhatsApp.
- Mencoes em grupos pelo padrao `@telefone`.
- Assinatura do atendente logado no corpo da mensagem enviada.
- Permissao de perfil para visualizar todas as conversas ativas.
- Preview visual de mensagem respondida quando a referencia possuir midia.
- Integracao das novas permissoes com a tela de perfis.

## Implementado

### Reacoes em realtime

O frontend passou a escutar `message.reaction.updated` e invalida as queries de conversas/mensagens correspondentes. Isso remove a dependencia de receber uma nova mensagem para a reacao aparecer.

### Permissao de visibilidade

Criada a permissao:

```text
chat.conversations.view_all_active
```

Ela foi adicionada ao catalogo backend, ao mapa de permissoes do frontend e a tela de perfis como:

```text
Ver todas conversas ativas
```

Quando ativa, o usuario pode visualizar conversas ativas de outros atendentes. A regra de envio permanece restrita ao atendente responsavel.

A aba Ativas exige conversa com responsavel; leads sem protocolo/responsavel continuam somente em Leads.

O salvamento de perfis garante a existencia da permissao no catalogo persistido antes de criar o vinculo com o perfil.

### Assinatura do atendente

Quando o perfil possui `chat.agent_name.show`, a mensagem enviada ao WhatsApp passa a ser prefixada no formato:

```text
*<nome do atendente>:*

<mensagem>
```

O ID/protocolo foi removido da assinatura apos validacao fisica. O nome do atendente passou a ser enviado em negrito no WhatsApp, com `:` ao final.

O frontend preserva quebras de linha na bolha da mensagem.

### Mencoes WhatsApp

O Composer passa a sugerir participantes ja observados nas mensagens do grupo ao digitar `@`.

A insercao gera um token legivel, como `@Nome_Do_Participante`, e o backend resolve esse token contra os participantes ja vistos no grupo para enviar o identificador real no payload da Evolution.

Apos validacao fisica, o payload foi ajustado para o contrato Evolution v2.3.7 com campo `mentioned`.

### Grupos

Grupos nao sao tratados como leads.

Quando um grupo encerrado recebe nova mensagem, a conversa volta como aberta sem responsavel fixo. Assim o grupo fica acessivel pela equipe conforme escopo/departamento e nao preso a um unico atendente.

Conversas de grupo ativas aparecem na aba Ativas mesmo sem responsavel individual.

### Preview rico de reply

A serializacao de mensagens agora inclui `media_data` da mensagem citada quando existir. O frontend usa esse dado para renderizar miniatura em replies de imagem/video.

### Inbox polish e arquivamento operacional

As bolhas de mensagem exibem avatar do contato/participante ao lado das mensagens recebidas e iniciais do atendente ao lado das mensagens enviadas.

A listagem lateral passa a exibir o preview da ultima mensagem abaixo do atendente, com normalizacao para midias (`Foto`, `Audio`, `Video`, `Documento`, `Figurinha`).

O label da instancia na listagem usa o nome amigavel da connection cadastrada, mantendo o identificador tecnico apenas como valor de filtro/API.

O contador de mensagens nao lidas nao e mais zerado ao abrir a conversa. Ele passa a ser zerado somente apos envio de texto, midia ou audio pelo Nexos.

Foi criada a coluna `Conversation.inboxArchivedAt` e o endpoint `PATCH /conversations/:id/inbox-archive`. A listagem do Inbox ignora conversas com esse campo preenchido, preservando historico e evitando duplicidade de conversa. O chat ganhou o botao `Arquivar` para retirar grupos/conversas das abas operacionais sem encerrar nem apagar.

## Validacao automatizada

Executado com sucesso:

```text
bunx tsc --noEmit
bun run --cwd backend test -- evolution-outbound-payload.factory.spec.ts evolution-messaging.provider.spec.ts messaging-reaction.service.spec.ts
bun run --cwd backend test -- realtime-events.spec.ts realtime-auth.service.spec.ts
bun run --cwd backend test -- evolution-outbound-payload.factory.spec.ts evolution-messaging.provider.spec.ts
bun run --cwd backend test -- messaging-inbound.service.spec.ts evolution-outbound-payload.factory.spec.ts evolution-messaging.provider.spec.ts
bun run backend:build
bun run build
bunx prisma generate --schema prisma/schema.prisma
bunx prisma migrate deploy --schema prisma/schema.prisma
```

Observacao:

```text
bun run --cwd backend test -- app.e2e-spec.ts
```

Nao executou os cenarios porque o ambiente local abortou antes dos testes:

```text
SEED_MODE=homologation requires an allowed homologation database, got nexos_1200.
```

Isso indica bloqueio de configuracao de ambiente, nao falha funcional dos pontos alterados.

## Validacao fisica pendente

Validar no WhatsApp real:

1. Reacao recebida do WhatsApp aparece no Nexos sem nova mensagem e sem F5.
2. Mencao em grupo enviada pelo Nexos notifica/marca o participante correto usando token legivel no texto.
3. Mensagem enviada pelo Nexos chega ao WhatsApp com assinatura somente do atendente e quebra de linha preservada.
4. Perfil com `Ver todas conversas ativas` salva sem erro interno.
5. Perfil com `Ver todas conversas ativas` consegue abrir conversas ativas de outros atendentes.
6. Mesmo com a permissao acima, o envio segue bloqueado para conversas assumidas por outro atendente.
7. Novas conversas diretas sem protocolo/responsavel aparecem somente em Leads, nao em Ativas.
8. Grupos ativos aparecem em Ativas e nao em Leads.
9. Grupo reaberto por mensagem recebida fica aberto sem responsavel fixo.
10. Reply de imagem/video mostra miniatura da mensagem citada.
11. Avatar aparece ao lado das mensagens recebidas/enviadas no Nexos.
12. Lista lateral mostra preview da ultima mensagem abaixo do atendente.
13. Lista lateral mostra nome amigavel da instancia, nao o codigo tecnico.
14. Contador de nao lidas permanece ao abrir conversa e zera apenas apos envio pelo Nexos.
15. Botao Arquivar retira conversa/grupo das abas Ativas/Leads sem apagar historico.
