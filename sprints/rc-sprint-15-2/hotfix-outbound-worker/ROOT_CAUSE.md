# Root Cause

Erro original observado: falha temporaria da Evolution durante outbound resultava em `OutboundDispatchError`, seguida de `triggerUncaughtException` e encerramento do Node.

Causa raiz confirmada no worker:
- `MessagingOutboundWorker.withConversationLock` criava `tracked = next.finally(...)`.
- O metodo guardava `tracked` no mapa de locks, mas retornava `next`.
- Quando `next` rejeitava, `tracked` tambem rejeitava por causa do `finally`.
- Essa promise `tracked` nao era aguardada nem capturada.
- O BullMQ recebia a rejeicao de `next`, mas a rejeicao paralela de `tracked` ficava sem observador e podia virar `unhandledRejection`.

Correcao:
- `withConversationLock` agora retorna `tracked`.
- O processor usa `return await this.withConversationLock(...)`.
- Listeners do worker usam wrappers seguros e nunca propagam falha de logger/handler.

Teste de regressao:
- `messaging-outbound.worker.spec.ts` simula `dispatchQueuedMessage` rejeitando.
- O teste confirma que a rejeicao volta ao caller e que `process.on("unhandledRejection")` nao recebe evento.

