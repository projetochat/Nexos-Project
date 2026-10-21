# Auditoria e reorganizacao documental — 2026-10-05

## Objetivo

Inventariar e classificar `docs/` e `sprints/`, propor uma estrutura de referencia, preservar a trilha historica e impedir que documentos antigos sejam confundidos com o comportamento vigente. Esta etapa nao move nem exclui os 158 documentos encontrados.

## Resultado executivo

- Inventario completo: 158 arquivos, sendo 52 em `docs/` e 106 em `sprints/`; 157 Markdown e 1 DOCX.
- Git: 153 arquivos rastreados e 5 documentos recentes ainda nao rastreados.
- Duplicacao: nenhuma duplicata byte a byte por SHA-256. Existem sobreposicoes tematicas, que nao foram tratadas como duplicatas exatas.
- Atualidade: nenhum documento legado recebeu isoladamente o selo **Atual e comprovado**.
- Historico: os 105 relatorios dentro das subpastas de `sprints/` sao registros historicos; `sprints/README.md` era um indice parcial e desatualizado.
- Substituicao: os dez stubs `docs/01-*` a `docs/10-*` declaram sucessores; `docs/PRODUCTION-READINESS-20260922.md` e incompatível com D-009.
- Sensibilidade: 59 arquivos receberam marcacao heuristica **Potencialmente sensivel**. A varredura encontrou exemplos locais/demo, nomes de secrets e detalhes operacionais, mas nao confirmou chave privada, Bearer real ou segredo de producao.
- Movimentacao: adiada para uma segunda etapa porque scripts automatizados e links dependem de caminhos atuais.

## Estados de evidencia desta auditoria

### Observado em codigo e repositorio

- `backend/src/tickets/tickets.service.ts` aplica a politica tenant-wide aprovada por D-008; `docs/TICKETING.md` ainda descreve restricao por departamento/atribuicao.
- O backend atual registra modulos que documentos de baseline tratam como planejados ou ausentes.
- O `package.json` atual possui verificacoes e testes que `docs/README.md` antigo declara indisponiveis.
- Scripts de contrato leem caminhos fixos em `docs/`, entre eles `TICKETING.md`, `API.md`, `STORAGE.md`, `DEPLOY.md`, `CAMPAIGNS.md`, `AUTOMATIONS.md`, `OPERATIONS.md`, `PLATFORM_ADMIN.md`, `IMPERSONATION.md` e `PLANS_AND_SUBSCRIPTIONS.md`.
- `scripts/production/README.md` referencia `docs/PRODUCTION-AUTOMATION.md`.

### Testado nesta auditoria

- Contagem e extensoes dos arquivos.
- Historico Git mais recente por arquivo.
- Estado rastreado ou nao rastreado.
- SHA-256 para detectar duplicatas exatas.
- Validade dos 30 links Markdown locais existentes antes das alteracoes.
- Busca heuristica de possivel sensibilidade, sem reproduzir valores encontrados.
- Geracao deterministica da matriz pelo script `scripts/generate-documentation-inventory.ps1`.

Nenhum teste funcional, migration, seed, E2E, banco, Redis, integracao externa, VPS ou deploy foi executado.

### Decisoes aprovadas aplicadas

- A fonte central indicada no `AGENTS.md` prevalece sobre documentos historicos.
- D-007 impede apresentar CRUD ou telas introdutorias como prova de executores/funcionalidades completas.
- D-008 torna desatualizada a restricao departamental de visibilidade de chamados descrita em documentos antigos.
- D-009 substitui D-001 e exige autorizacao granular por Perfil de Acesso.
- D-010 define Chat obrigatorio, modulos opcionais por tenant e sobrescritas de limites sem alterar o plano-base.
- Nenhuma dessas decisoes foi alterada por esta reorganizacao.

### Hipoteses

- Sobreposicoes entre documentos de mensageria, deploy e auditoria podem permitir consolidacao futura, mas nao provam duplicacao nem autorizam remocao.
- Os cinco documentos recentes parecem acompanhar codigo/testes presentes na arvore local, mas a arvore esta suja e nao houve certificacao integrada nesta auditoria.

### Pendencias e decisoes humanas

1. Confirmar na fonte central a alegada `D-CRM-001` de `CAMPOS-ADICIONAIS-IDENTIDADE-20261005.md`; ela nao consta no `AGENTS.md`.
2. Confirmar as regras funcionais de onboarding: tenants novas, ausencia de registro para tenants antigas, oito etapas e restricao administrativa.
3. Decidir se a identidade de abertura de conversa e a possibilidade de reatribuicao descritas em `ACTIVE-CONVERSATION-OPENING-20261005.md` sao contrato vigente.
4. Decidir a retirada futura de `{{cumprimento}}` e a migracao de templates persistidos.
5. Resolver as decisoes operacionais abertas em `DEVOPS-HANDOFF-20261002.md`, incluindo topologia, proxy/TLS, restore, RPO/RTO e isolamento.
6. Confirmar se `Guia_UX_UI_Trixus.docx` e referencia visual vigente; sua estrutura foi lida, mas a renderizacao visual nao foi concluida.
7. Escolher documentos canonicos para arquitetura, API e operacao antes de promover ou mover conteudo.
8. Autorizar a segunda etapa de movimentacao depois que consumidores de caminhos e links forem atualizados e verificados.

## Documentos materialmente divergentes

| Documento | Evidencia da divergencia | Tratamento nesta etapa |
| --- | --- | --- |
| `docs/TICKETING.md` | Escopo departamental antigo versus D-008 e codigo tenant-wide | Parcialmente atual; nao promover antes de corrigir |
| `docs/PRODUCTION-READINESS-20260922.md` | Preserva D-001, substituida por D-009 | Substituido e historico |
| `docs/ARCHITECTURE.md` | Baseline anterior aos modulos atuais | Parcialmente atual |
| `docs/README.md` | Baseline antiga, comandos perigosos para o ambiente corrente e exemplos locais | Aviso explicito adicionado; conteudo preservado |
| `docs/DEPLOY.md` | Baseline anterior ao contrato operacional mais recente | Parcialmente atual e potencialmente sensivel |
| `sprints/README.md` | Indice incompleto, com estados antigos e `TBD` | Aviso explicito adicionado; historico preservado |

## Alteracoes documentais realizadas

- Criada a estrutura proposta com indices explicativos.
- Criados inventario, matriz, auditoria e mapa de movimentacao.
- Adicionados avisos explicitos em `docs/README.md` e `sprints/README.md` sem remover o conteudo historico.
- Criado gerador reproduzivel do inventario.
- Nenhum documento original foi movido, apagado ou publicado no Notion.

## Limitacoes

- O Notion central exigiu autenticacao e nao havia sessao conectada. A referencia local aprovada em `C:/dev/preservacao-20260921/segundo-cerebro` esta datada de 2026-09-22 e nao incorpora automaticamente D-008, D-009 e D-010.
- O DOCX foi lido estruturalmente (82 paragrafos, 17 tabelas e 1 secao), mas nao renderizado visualmente por indisponibilidade do componente de renderizacao.
- A marcacao de sensibilidade e heuristica e exige revisao humana antes de publicacao externa.
- A auditoria cruzou pontos de alto risco; nao revalidou integralmente cada afirmacao dos 158 arquivos contra o codigo atual.

## Backup e retorno

Backup anterior a esta etapa:

- Diretorio: `C:/dev/preservacao-20260921/fechamento/20261005-documentation-reorg-before`
- Arquivos preservados: 158 documentos mais `manifest.json`
- SHA-256 do manifesto: `154fc8847b3acc0ddaa8f34dfca292cd010c3ad6dc4abaf6d241128b18ea78a6`

Retorno recomendado:

1. Preservar mudancas documentais posteriores.
2. Conferir o hash do manifesto.
3. Para retorno antes do commit, restaurar apenas os caminhos desta etapa a partir do backup, nunca toda a arvore de trabalho.
4. Para retorno depois do commit, criar um commit de reversao; nao usar reset destrutivo.
5. Nao restaurar `.env`, bancos, Redis, arquivos de clientes ou dumps como parte deste procedimento documental.
