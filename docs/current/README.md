# Referencias documentais atuais

> Estado em 2026-10-05: nenhum documento tecnico legado foi promovido isoladamente a **Atual e comprovado**. A fonte central aprovada no `AGENTS.md` e as decisoes D-003 a D-010 prevalecem. O Notion nao estava acessivel sem autenticacao durante esta auditoria; a copia local aprovada de 2026-09-22 foi usada apenas como evidencia historica e normativa daquele momento.

Use esta pasta como porta de entrada para a governanca documental, nao como certificacao integral do sistema:

- [Auditoria documental de 2026-10-05](./DOCUMENTATION_AUDIT_2026-10-05.md)
- [Inventario e matriz completa](./DOCUMENT_INVENTORY_2026-10-05.md)
- [Mapa de movimentacao proposto](./MOVEMENT_MAP_2026-10-05.md)

## Hierarquia de confianca

1. Decisao aprovada e datada no `AGENTS.md` ou na fonte central aprovada.
2. Evidencia atual em codigo, acompanhada de teste executado no escopo declarado.
3. Documento parcialmente atual, usado somente com conferencia das fontes citadas.
4. Documento pendente, substituido ou historico, nunca usado sozinho para afirmar comportamento vigente.

## Uso seguro

- Nao copiar para sistemas externos credenciais, `.env`, dados pessoais, dumps, logs ou detalhes operacionais sem revisao.
- Nao executar migrations, seeds, resets, E2E ou verificacoes amplas contra bancos correntes.
- Nao interpretar mocks, testes estaticos ou persistencia de configuracao como prova de entrega real.
- Antes de alterar uma decisao, obter nova autorizacao do usuario e registrar data, regra anterior e impacto.
