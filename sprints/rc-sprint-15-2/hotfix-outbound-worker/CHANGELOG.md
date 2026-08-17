# Changelog

- Corrigida promise de lock do `MessagingOutboundWorker` que podia rejeitar sem observador.
- Processor agora retorna/aguarda corretamente a execucao protegida por lock.
- Adicionados listeners seguros para ciclo de vida e falhas do BullMQ worker.
- Adicionado classificador de erros Evolution com status HTTP, erro de rede, retryable e unknown outcome.
- Logs outbound passam a registrar request, response, retry scheduled e failed final com dados sanitizados.
- Sucesso de provider sem `providerMessageId` deixa de ser aceito silenciosamente.
- Adicionado teste de regressao para `unhandledRejection`.

