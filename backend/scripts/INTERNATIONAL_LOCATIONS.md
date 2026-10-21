# Catálogo internacional de localidades

O catálogo publicado com a aplicação é um snapshot imutável, verificado por SHA-256 e carregado sem acesso à internet durante o deploy. Ele contém:

- todos os países presentes no `countryInfo.txt` do GeoNames;
- divisões administrativas de primeiro nível do `admin1CodesASCII.txt`;
- o recorte internacional `cities500` do GeoNames, que reúne localidades com população superior a 500 habitantes e sedes administrativas até PPLA4;
- as 27 UFs e os 5.571 municípios da DTB 2025 do IBGE, que substituem os registros brasileiros do GeoNames.

O snapshot aprovado está em `backend/data/locations/catalog-v1`. O `manifest.json` registra versão, data, fontes, hashes dos arquivos oficiais, contagens e hashes de cada fragmento. Os fragmentos compactados ficam abaixo do limite de tamanho por arquivo do repositório.

## Garantias de publicação

`bun run backend:locations:catalog:verify` valida integralmente o manifesto, os hashes, as contagens, as referências país/divisão e as unicidades antes de abrir o banco. O executor oficial de migrações repete essa validação no preflight e, depois do `prisma migrate deploy`, importa o catálogo em lotes dentro de uma única transação. A mesma versão é idempotente e resulta em `ALREADY_ACTIVE`.

Nenhuma fonte externa é consultada na VPS. Se a carga ou a validação falhar, a transação é revertida e o deploy permanece no fluxo protegido de recuperação pós-migração. O backfill de clientes existentes não faz parte do deploy.

## Atualização controlada do snapshot

1. Baixe `countryInfo.txt`, `admin1CodesASCII.txt` e `cities500.zip` de `https://download.geonames.org/export/dump/`.
2. Baixe `DTB_2025.zip` do diretório oficial do IBGE e extraia `RELATORIO_DTB_BRASIL_2025_MUNICIPIOS.xls`.
3. Gere o catálogo em um diretório vazio com `backend/scripts/generate-location-catalog.mjs`, informando também os dois arquivos ZIP para registrar seus hashes.
4. Compare contagens, hashes e amostras com a versão anterior. Uma mudança de snapshot exige revisão e ensaio integral em banco descartável.

O importador manual `sync-international-locations.mjs` continua disponível para auditorias descartáveis. Ele espera `cities500.txt` e nunca altera cadastros legados por padrão. `--with-backfill` exige autorização específica e não deve ser usado pelo deploy.

## Atribuição

Os dados internacionais são uma adaptação do GeoNames, licenciada sob CC BY 4.0. O catálogo filtra o recorte `cities500`, remove os registros brasileiros e normaliza os dados para o modelo Trixus. Os dados brasileiros são provenientes da Divisão Territorial Brasileira 2025 do IBGE. Consulte `backend/data/locations/ATTRIBUTION.md`.
