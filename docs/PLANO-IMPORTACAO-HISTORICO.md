# Análise e plano de correção da importação de histórico

Data: 18/09/2026. Escopo: conversas individuais e grupos do WhatsApp.

## Resultado executivo

Há falhas confirmadas no processo atual. No banco local, as duas importações estão COMPLETED, com zero conversas e mensagens. A consulta de leitura ao provedor configurado localmente retorna hoje 94 chats: 60 individuais e 34 grupos. Amostras de ambos retornaram mensagens posteriores à data de corte configurada. Portanto, o estado “Concluída” não comprova que o histórico disponível foi importado.

A principal hipótese para a primeira execução vazia é que ela aconteceu antes de o provedor disponibilizar o histórico. O código confirma a ausência de espera pela sincronização e de reconciliação após uma conclusão vazia. Sem a resposta original do provedor e os logs daquela execução, não é possível afirmar o motivo exato do retorno vazio inicial.

Esta etapa produziu diagnóstico e plano; não executou reimportação nem alterou o processamento ou os registros existentes. O ambiente de produção não foi auditado.

## Evidências verificadas

- Banco local: DIRECT e GROUP, data inicial 01/01/2026 às 00h de São Paulo; ambos iniciados em 18/09/2026 00:41:10.936 UTC. Finalizaram em 26 ms e 25 ms, respectivamente, com todos os contadores zerados.
- Instância local conectada, com os dois tipos habilitados.
- Consulta atual `findChats`: HTTP 200, array de 94 registros, com `remoteJid` disponível.
- Amostra individual e amostra de grupo: `findMessages` retornou 100 registros na primeira página; todos dentro do período configurado e pertencentes ao chat solicitado. A segunda página retornou mais 100 sem sobreposição de IDs com a primeira.
- Amostragem não equivale à conferência integral das 94 conversas; não se extrapolou o total de mensagens.
- 46 testes existentes passaram em quatro arquivos: importador, recebimento de mensagens, cliente Evolution e tradutor de eventos. Os três testes específicos do importador cobrem classificação final de conversas; não cobrem sincronização tardia, reinício concorrente, respostas vazias ou grandes volumes.

## Funcionamento atual

1. Na criação, o Trixus salva habilitação e data para DIRECT e GROUP.
2. Ao conectar a instância, consultar/atualizar seu estado ou iniciar o servidor, solicita os trabalhos habilitados.
3. Cada trabalho é disparado por temporizador em memória, com proteção apenas dentro daquele processo.
4. Consulta chats, separa individuais/grupos, busca páginas de mensagens, filtra por data e ordena em memória.
5. Passa cada mensagem pelo fluxo de recebimento com `historical: true`.
6. Finaliza conversas, cria/remove leads conforme a última mensagem e registra COMPLETED ou PARTIAL_FAILED.
7. O modal consulta o progresso a cada três segundos; a lista de conversas recebe eventos ao terminar.

## Problemas e riscos

| Prioridade | Evidência no código                                                                                                                                                     | Consequência                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| P0         | `run` termina COMPLETED mesmo sem chats; `requestImport` não reinicia COMPLETED com a mesma data                                                                        | Histórico recebido posteriormente fica fora da importação; caso compatível com os registros locais                    |
| P0         | `finalizeConversations` remove atribuição, protocolo e não lidas, fecha grupos/última enviada e altera leads; inclui também mensagens duplicadas no conjunto finalizado | Uma nova tentativa pode alterar atendimentos existentes, inclusive sem inserir mensagens                              |
| P0         | Recebimento histórico atualiza `lastMessageAt` e prévia incondicionalmente e pode reabrir conversa fechada                                                              | Mensagens antigas podem substituir a prévia atual e modificar o estado operacional                                    |
| P1         | O gatilho usa conexão CONNECTED, sem aguardar disponibilidade do histórico; criação não configura explicitamente sincronização histórica                                | Conectado não significa histórico pronto; configuração e versão reais do provedor precisam ser verificadas            |
| P1         | `extractStoredRecords` retorna array vazio para formato desconhecido                                                                                                    | Resposta incompatível pode ser tratada como ausência legítima de dados                                                |
| P1         | Paginação usa quantidade retornada, descarta metadados e termina silenciosamente ao alcançar limites; chats não detectam página repetida                                | Importação incompleta pode aparecer como concluída; paginação básica funcionou na amostra local, mas faltam garantias |
| P1         | `Set` e temporizador são locais; não há reserva atômica, lease, heartbeat ou checkpoint persistido                                                                      | Dois servidores podem executar o mesmo trabalho; após reinício o trabalho recomeça desde o início                     |
| P1         | Retry zera o trabalho sem bloquear execução ativa e sem validar conexão pronta                                                                                          | Progresso pode ser sobrescrito ou ficar pendente; não cria trabalho ausente                                           |
| P1         | Busca todas as mensagens antes de filtrar por data; consulta metadados de grupo e baixa mídia no fluxo transacional                                                     | Alto consumo de memória, latência e risco de timeout em históricos grandes                                            |
| P1         | Exceção de uma mensagem interrompe o restante daquele chat                                                                                                              | Um item problemático impede importação das mensagens seguintes; tentativa posterior repete o trabalho inteiro         |
| P1         | Status/retry validam tenant, mas não aplicam o filtro individual de instâncias usado na listagem                                                                        | Revisar usuários com acesso restrito a instâncias dentro da mesma organização                                         |
| P2         | Interface não mostra falha da consulta de status; ausência de trabalho aparece como aguardando conexão                                                                  | Dificulta distinguir falha, configuração desabilitada, fila e ausência real de mensagens                              |
| P2         | Retry só aparece em FAILED/PARTIAL_FAILED e os campos ficam desabilitados na edição                                                                                     | Não há recuperação visível para o caso atual COMPLETED com zero                                                       |
| P2         | Data inicial usa São Paulo fixo; timestamps fora dos formatos aceitos são descartados antes dos contadores                                                              | Organizações em outros fusos e formatos de data não suportados precisam de diagnóstico explícito                      |
| P2         | Reações/edições traduzidas para outros tipos de evento são ignoradas pelo importador                                                                                    | Histórico não reproduz necessariamente todas as alterações e interações                                               |

## Plano de implementação, na ordem recomendada

### 1. Proteger o atendimento existente antes de reimportar

- Separar gravação de histórico de transições de atendimento.
- Preservar responsável, departamento, protocolo, status, arquivamento, não lidas e leads de conversas já existentes.
- Atualizar prévia e data somente quando a mensagem for mais recente, com proteção transacional contra mensagem ao vivo concorrente.
- Mensagem duplicada não deve disparar finalização ou mudanças operacionais.
- Para conversas criadas exclusivamente pela importação, manter inicialmente a classificação já existente, isolada das conversas operacionais; documentar onde serão exibidas.
- Identificar a origem histórica e o trabalho de importação na gravação, para auditoria. Mensagens históricas reais podem compor o BI pela data original; eventos administrativos continuam excluídos.

Critério: reimportar duas vezes não duplica mensagens nem modifica atendimentos existentes. Uma mensagem nova recebida durante o processo continua sendo a última da conversa.

### 2. Corrigir início, disponibilidade e conclusão

- Conferir versão e configuração do provedor utilizado no ambiente alvo, incluindo persistência e sincronização de histórico.
- Confirmar disponibilidade com sinal compatível com essa versão; usar reconciliação periódica como alternativa quando o evento não existir.
- Distinguir aguardando conexão, aguardando sincronização, em processamento, sem dados no período, concluída, parcial e falha.
- Resposta vazia antes de confirmar prontidão deve aguardar e tentar novamente com intervalo crescente e prazo máximo.
- Validar o formato da resposta: incompatibilidade deve ser erro explícito, nunca lista vazia.
- Permitir buscar mensagens faltantes após uma execução concluída, sem necessidade de desconectar ou ler outro QR Code.

Critério: uma execução inicialmente vazia importa os dados disponibilizados depois. Uma conta realmente sem histórico termina com informação clara de ausência de dados, não fica em repetição infinita.

### 3. Tornar o processamento retomável e eficiente

- Usar fila durável já suportada pelo projeto ou uma reserva persistente equivalente; chave por tenant, conexão e tipo, com lease e heartbeat.
- Manter execução e tentativas separadas do resumo, evitando apagar o histórico dos erros.
- Persistir progresso por chat/página, com ordenação estável e estratégia de retomada resistente a novas mensagens no provedor.
- Processar páginas em lotes, respeitar metadados reais e verificar repetição de páginas; limites atingidos devem resultar em importação parcial explícita.
- Aplicar filtro de data no provedor se suportado; caso contrário, só interromper por data após confirmar ordenação.
- Cachear metadados de grupo por chat; baixar mídia fora de transações longas, com tentativas próprias e estado de indisponibilidade.
- Registrar erros por item, continuar com os demais e reprocessar apenas falhas recuperáveis. Limitar concorrência e respeitar timeouts/rate limits.

Critério: reinício do servidor retoma o processo sem perda nem duplicação; duas réplicas não processam o mesmo trabalho simultaneamente.

### 4. Melhorar acompanhamento e controles

- Mostrar separadamente chats encontrados/processados, mensagens novas, duplicadas, fora do período, incompatíveis e com erro; distinguir falhas de mídia.
- Mostrar início, última atividade e término, com horário da organização. Percentual apenas quando o total for confiável.
- Exibir erros de consulta, motivo de espera e orientação de recuperação.
- Permitir retomar falhas e buscar mensagens faltantes; impedir comandos conflitantes durante execução.
- Permitir alterar habilitação/data mediante fluxo explícito de nova execução, preservando o histórico anterior.
- Proteger leitura e comandos com tenant e acesso à instância; publicar progresso respeitando o mesmo escopo, mantendo consulta periódica como contingência.

Critério: desktop e mobile apresentam o mesmo estado, e o usuário entende por que existem zero mensagens ou importação parcial.

### 5. Validar e recuperar os trabalhos afetados

- Adicionar testes de: resposta vazia seguida de dados; formato inválido; paginação repetida e limite; diferentes fusos e meia-noite; mensagens sem timestamp; grupos e participantes; duplicatas; conversa ativa com mensagem ao vivo; falha de mídia/item; desconexão; reinício; concorrência; isolamento de tenant e permissões.
- Executar piloto em uma instância de homologação, inicialmente com um chat individual e um grupo e período reduzido.
- Conciliar IDs de mensagens disponíveis no provedor com os gravados, documentando cada exclusão e limite de disponibilidade.
- Após as proteções da etapa 1, oferecer recuperação dos trabalhos COMPLETED com zero. Não zerar trabalhos ou reimportar em massa antes disso.
- Expandir gradualmente, acompanhar erros/tempo/volume e manter forma de pausar novas execuções. Evitar exclusão de mensagens como mecanismo de reversão.

## Limites e dependências

A origem imediata é o histórico disponível na Evolution; não há evidência de que ela tenha recebido todas as mensagens antigas existentes no celular. A data escolhida no Trixus não garante que mensagens anteriores à sincronização estejam acessíveis. A disponibilidade precisa ser conferida por conta e versão.

As notas oficiais da Evolution registram diferenças de sincronização e eventos entre versões, incluindo `messaging-history.set` em uma versão candidata. Isso fundamenta validar a versão efetiva antes de escolher o gatilho; não recomenda atualização automática nem adoção de pré-release: [releases oficiais](https://github.com/evolution-foundation/evolution-api/releases).

## Arquivos principais para execução

- `backend/src/messaging/messaging-history-import.service.ts`: fila, paginação, processamento e finalização.
- `backend/src/messaging/messaging-inbound.service.ts`: persistência, deduplicação, estado da conversa e mídia.
- `backend/src/messaging/evolution/evolution.client.ts`: contrato de consulta e configuração do provedor.
- `backend/src/messaging/evolution/evolution-webhook.translator.ts`: tradução de eventos e mensagens.
- `backend/src/messaging/messaging-connections.service.ts` e controller: início, status, retry e acesso.
- `backend/prisma/schema.prisma`: execuções, progresso e rastreabilidade.
- `src/routes/instancias.tsx` e `src/lib/trixus-api.ts`: controles, progresso e erros.
