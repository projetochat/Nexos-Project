# Pacotes SCP controlados

Este fluxo substitui temporariamente o envio automático do GitHub Actions. Ele
gera dois pacotes independentes, a partir dos blobs canônicos de um único commit:

- homologação: `hom.trixus.com.br` e `api-hom.trixus.com.br`;
- produção: somente `app.trixus.com.br` e `api.trixus.com.br`.

O build recusa árvore suja, usa `git archive` para impedir conversões CRLF nas
migrations, inclui o SHA e a tree nas imagens, testa os dois frontends e bloqueia
`chat.trixus.com.br` no frontend de produção.

Execute somente depois dos testes e do commit local aprovado:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/scp-release/build-packages.ps1 -Commit HEAD
```

A saída privada fica em `.release-artifacts/scp-<sha>/`. O pacote de produção
deve ser enviado apenas depois da aprovação funcional da homologação no mesmo
SHA. `.env` é lido apenas para os valores públicos do Supabase e nunca é copiado
para os pacotes.
