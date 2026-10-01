# Trixus — regras de estabilização aprovadas

## Exceção autorizada — preparação para produção, 22/09/2026

Nesta etapa, o usuário autorizou consultar Git/GitHub, integrar a main preservando as funcionalidades locais, resolver conflitos e fazer commits locais na branch de trabalho. Esta autorização substitui a restrição anterior de não usar Git somente para esta preparação. Não enviar para main, fazer merge de PR ou executar deploy. Não alterar serviços da VPS; preservar o isolamento do GLPI. Verificações e migrações de teste devem usar recursos descartáveis, nunca banco de produção. Não desativar verificações, aumentar limites de erros ou enfraquecer testes para obter aprovação. As demais decisões abaixo permanecem vigentes.

## Fonte da verdade

Central: https://app.notion.com/p/3cf8a380df0581c0aa5afa1a9c813863

Plano aprovado pelo usuário nesta conversa, em 21/09/2026. A documentação antiga em `docs` pode misturar histórico e estado atual. Não a tratar como evidência suficiente. Referência local inicial: `C:\dev\preservacao-20260921\segundo-cerebro`.

## Restrições obrigatórias

- Preservar interface, textos, navegação, contratos e fluxos existentes.
- Corrigir bugs que mudem comportamento somente após definir o resultado correto com o usuário.
- Trabalhar localmente, sem comandos Git, commits, branches, worktrees, pushes ou deploy. Comparar arquivos e hashes diretamente. Documentação no Notion está autorizada.
- Preservar backup antes das alterações e documentar retorno. O backup inicial está em `C:\dev\preservacao-20260921`; verificar relatórios e lacunas antes de confiar na recuperação.
- Usar subagentes para subtarefas independentes e delimitadas de inventário, auditoria e revisão. Revisar suas conclusões; afirmações de agentes não substituem provas.
- Entregar apenas com objetivo, justificativa, evidências, verificações executadas, limitações e recuperação. Não alegar teste aprovado sem executá-lo.
- Não remover código apenas por parecer genérico ou sem uso. Demonstrar dependências e impacto.
- Manter mudanças pequenas. Não misturar correções, atualização de dependências e reorganização ampla.
- Não publicar `.env`, credenciais, dados pessoais ou dumps no Notion.
- Não rodar verificação geral, seeds, resets, migrações ou E2E contra os bancos correntes. Conferir isolamento de banco, Redis, arquivos e integrações antes. `scripts/verify.mjs` inclui migrações e testes que alteram estado.

## Plano — preservar a ordem

1. Mapear o sistema antes de alterar.
2. Registrar o comportamento que precisamos preservar, inclusive referências visuais.
3. Fazer auditoria por área, exigindo evidências.
4. Priorizar pelo risco: P0 crítico, P1 alto, P2 médio, P3 baixo.
5. Corrigir em ciclos pequenos e verificáveis, com retorno documentado.
6. Manter regras para o uso de IA e atualizar a documentação com provas.

## Decisão D-001 — permissões individuais

O usuário confirmou em 21/09/2026 que a suspensão de permissões individuais é uma decisão temporária aprovada. Preservar o comportamento de `AuthService` e `PermissionsGuard` que concede a lista de permissões nessa condição. Não ativar controle granular automaticamente nem classificá-lo como bug.

Essa exceção não autoriza remover isolamento entre organizações, vínculo ativo, revogação de sessão ou escopo de instâncias/departamentos. Alterar a exceção exige nova autorização explícita do usuário.

## Integridade documental

As regras aprovadas não podem ser alteradas autonomamente. Registrar nova decisão datada quando o usuário autorizar alteração. Mapas, diagnósticos e testes devem refletir novas evidências e preservar histórico. Separar observado em código, testado, hipótese, decisão aprovada e pendência. Não apresentar inventário inicial como auditoria concluída ou sistema pronto para produção.

## Decisões adicionais aprovadas — 21/09/2026

- D-003: se a gravação do histórico de chamado falhar, cancelar também a alteração. Manter aparência e fluxo de sucesso. Alterações de dados e seu histórico devem ser atômicos; efeitos externos precisam de tratamento próprio.
- D-004: cadastro de atendente não pode substituir senha, nome ou estado de conta global existente em outra empresa. Rejeitar o cadastro e exigir fluxo explícito de convite/vínculo. Não confundir convite com autorização de redefinir credenciais sem prova de posse.
- D-005: recuperar campanhas após falha de fila ou erro transitório comprovadamente anterior à criação da mensagem, mantendo proteção contra duplicação. Resultado de envio/commit ambíguo não autoriza reenviar automaticamente.
- D-006: revalidar vínculo/sessão ativa nas rotas de perfil e empresa e aplicar escopo de instância em leads. A suspensão de permissões individuais D-001 permanece vigente.
- D-007: funcionalidades ainda não implementadas (executores de agendamentos/automações, agente de IA e persistência de configurações) ficam em backlog separado; concluir esta entrega pelo escopo das correções verificadas, sem apresentá-la como certificação integral do sistema.
- D-008 (01/10/2026): como solução paliativa, a criação e a visibilidade de chamados não são restringidas pelos departamentos do atendente ou do contato. Um atendente autorizado a criar chamados pode vinculá-los a qualquer departamento ativo da própria empresa, e usuários com acesso a chamados podem visualizar os chamados da empresa. Preservar obrigatoriamente o isolamento entre tenants e as permissões de acesso a chamados. Uma futura retomada do escopo por departamento exige nova decisão explícita e deve tratar criação e visibilidade em conjunto.

Provas, backups por alteração e limitações em `C:/dev/preservacao-20260921/fechamento`. Testes com mocks não certificam entregas reais; persistir agendamento/regra não comprova que exista executor. Não tratar telas introdutórias ou controles sem persistência como funcionalidades concluídas.
