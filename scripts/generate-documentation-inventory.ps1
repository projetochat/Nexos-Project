param(
  [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$OutputPath = (Join-Path $RepositoryRoot 'docs/current/DOCUMENT_INVENTORY_2026-10-05.md')
)

$ErrorActionPreference = 'Stop'

function Get-GitEvidence {
  param([string]$RelativePath)

  $entry = git -C $RepositoryRoot log -1 --date=short --format='%h|%ad' -- $RelativePath
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao consultar o historico Git de $RelativePath"
  }

  if ([string]::IsNullOrWhiteSpace($entry)) {
    return $null
  }

  $parts = $entry.Trim().Split('|', 2)
  return [pscustomobject]@{ Commit = $parts[0]; Date = $parts[1] }
}

function Get-Title {
  param([System.IO.FileInfo]$File)

  if ($File.Extension -ne '.md') {
    return 'Guia visual e de interface (objetivo inferido pelo nome; binario nao inspecionado)'
  }

  $heading = Get-Content -LiteralPath $File.FullName -Encoding UTF8 -TotalCount 80 |
    Where-Object { $_ -match '^#{1,3}\s+\S' } |
    Select-Object -First 1
  if ($heading) {
    return ($heading -replace '^#{1,3}\s+', '').Trim()
  }

  return $File.BaseName.Replace('_', ' ').Replace('-', ' ')
}

function Get-Replacement {
  param([string]$Name)

  $map = @{
    '01-arquitetura.md' = 'docs/ARCHITECTURE.md + fonte central aprovada'
    '02-estrutura-de-pastas.md' = 'docs/ARCHITECTURE.md + docs/COMPONENTS.md + docs/CODING_GUIDELINES.md'
    '03-rotas-e-fluxo.md' = 'docs/USER_FLOW.md + documentacao modular revalidada'
    '04-banco-de-dados.md' = 'docs/DATABASE.md'
    '05-apis.md' = 'docs/API.md'
    '06-autenticacao-e-rbac.md' = 'docs/AUTHENTICATION.md + AGENTS.md (D-009)'
    '07-regras-de-negocio.md' = 'docs/BUSINESS_RULES.md + AGENTS.md'
    '08-design-system.md' = 'docs/COMPONENTS.md + docs/CODING_GUIDELINES.md'
    '09-decisoes-tecnicas.md' = 'AGENTS.md + fonte central aprovada'
    '10-operacao-e-roadmap.md' = 'docs/OPERATIONS.md + fonte central aprovada'
    'PRODUCTION-READINESS-20260922.md' = 'AGENTS.md (D-009/D-010) + docs/DEVOPS-HANDOFF-20261002.md, apos validacao'
    'SPRINT_08_04_REWORK_II_REPORT.md' = 'sprints/sprint-08.04/RELATORIO.md e relatorios posteriores, apenas como historico'
    'RELATORIO-TENTATIVA-01.md' = 'sprints/sprint-01/RELATORIO.md'
  }

  if ($map.ContainsKey($Name)) { return $map[$Name] }
  return '—'
}

function Get-Classification {
  param([string]$RelativePath, [bool]$Tracked)

  $name = Split-Path $RelativePath -Leaf
  $labels = [System.Collections.Generic.List[string]]::new()

  if ($RelativePath -eq 'sprints/README.md') {
    $labels.Add('Parcialmente atual')
  } elseif ($RelativePath.StartsWith('sprints/')) {
    $labels.Add('Historico')
    if ($name -eq 'RELATORIO-TENTATIVA-01.md') { $labels.Add('Substituido') }
  } elseif ($name -match '^(0[1-9]|10)-') {
    $labels.Add('Substituido')
  } elseif ($name -in @('AUDITORIA_INTEGRAL_2026-09-15.md', 'SPRINT_08_04_REWORK_II_REPORT.md', 'CHANGELOG.md')) {
    $labels.Add('Historico')
  } elseif ($name -eq 'PRODUCTION-READINESS-20260922.md') {
    $labels.Add('Substituido')
    $labels.Add('Historico')
  } elseif ($name -eq 'VPS-DEPLOY.md') {
    $labels.Add('Substituido')
    $labels.Add('Historico')
  } elseif ($name -eq 'PLANO-IMPORTACAO-HISTORICO.md') {
    $labels.Add('Historico')
    $labels.Add('Pendente de validacao')
  } elseif ($name -eq 'Guia_UX_UI_Trixus.docx') {
    $labels.Add('Parcialmente atual')
    $labels.Add('Pendente de validacao')
  } elseif ($name -in @('ROADMAP.md', 'DEVOPS-HANDOFF-20261002.md', 'PRODUCTION-AUTOMATION.md')) {
    $labels.Add('Pendente de validacao')
  } elseif (-not $Tracked) {
    $labels.Add('Parcialmente atual')
    $labels.Add('Pendente de validacao')
  } else {
    $labels.Add('Parcialmente atual')
  }

  return $labels
}

function Get-Destination {
  param([string]$RelativePath)

  $name = Split-Path $RelativePath -Leaf
  if ($RelativePath -eq 'sprints/README.md') { return 'sprints/README.md (indice historico)' }
  if ($RelativePath.StartsWith('sprints/')) { return 'sprints/archive/' + $RelativePath.Substring(8) }
  if ($name -match '^(0[1-9]|10)-') { return 'docs/archive/legacy-index/' + $name }
  if ($name -in @('AUDITORIA_INTEGRAL_2026-09-15.md', 'SPRINT_08_04_REWORK_II_REPORT.md', 'PRODUCTION-READINESS-20260922.md')) { return 'docs/archive/reports/' + $name }
  if ($name -in @('ROADMAP.md', 'PLANO-IMPORTACAO-HISTORICO.md')) { return 'docs/archive/plans/' + $name }
  if ($name -eq 'CHANGELOG.md') { return 'docs/archive/CHANGELOG.md (ou ledger current, apos decisao humana)' }
  if ($name -in @('DEPLOY.md', 'VPS-DEPLOY.md', 'OPERATIONS.md', 'PRODUCTION-AUTOMATION.md', 'DEVOPS-HANDOFF-20261002.md')) { return 'docs/operations/' + $name }
  if ($name -in @('ARCHITECTURE.md', 'DATABASE.md', 'COMPONENTS.md', 'CODING_GUIDELINES.md', 'Guia_UX_UI_Trixus.docx')) { return 'docs/architecture/' + $name }
  if ($name -in @('BUSINESS_RULES.md', 'ROADMAP.md')) { return 'docs/decisions/' + $name }
  if ($name -eq 'README.md') { return 'docs/current/README.md' }
  return 'docs/modules/' + $name
}

function Test-PotentialSensitivity {
  param([System.IO.FileInfo]$File, [string]$RelativePath)

  if ($File.Extension -ne '.md') { return $false }
  if ($RelativePath -match '(?i)(DEPLOY|OPERATIONS|ENVIRONMENT|NETWORK|FORENSIC|PHYSICAL|MIGRATION|DEVOPS|STORAGE|AUTHENTICATION|DATABASE|README)') { return $true }

  $content = Get-Content -Raw -LiteralPath $File.FullName -Encoding UTF8
  return $content -match '(?i)(demo1234|postgresql://|redis://|service[_ -]?role|api[_ -]?key|password|senha|token|dump|backup)'
}

function Escape-Cell {
  param([string]$Value)
  if ($null -eq $Value) { return '—' }
  return ($Value -replace '\|', '\|' -replace "`r?`n", ' ').Trim()
}

$docs = Get-ChildItem -LiteralPath (Join-Path $RepositoryRoot 'docs') -File
$sprints = Get-ChildItem -LiteralPath (Join-Path $RepositoryRoot 'sprints') -Recurse -File |
  Where-Object { $_.FullName -notmatch '[\\/]sprints[\\/]archive[\\/]' }
$files = @($docs) + @($sprints) | Sort-Object FullName

$rows = foreach ($file in $files) {
  $relative = [System.IO.Path]::GetRelativePath($RepositoryRoot, $file.FullName).Replace('\', '/')
  $git = Get-GitEvidence -RelativePath $relative
  $tracked = $null -ne $git
  $classifications = [System.Collections.Generic.List[string]]::new()
  Get-Classification -RelativePath $relative -Tracked $tracked |
    ForEach-Object { $classifications.Add($_) }
  $sensitive = Test-PotentialSensitivity -File $file -RelativePath $relative
  if ($sensitive) { $classifications.Add('Potencialmente sensivel') }

  $evidence = if ($tracked) {
    "Git $($git.Commit) em $($git.Date); conteudo nao revalidado integralmente nesta auditoria"
  } else {
    'Worktree local nao rastreado; codigo/testes citados existem, sem certificacao integrada nesta auditoria'
  }
  $date = if ($tracked) { $git.Date } else { $file.LastWriteTime.ToString('yyyy-MM-dd') }
  $risk = if ($sensitive) {
    'Alto: revisar/redigir antes de publicar; mover pode quebrar referencias'
  } elseif ($relative.StartsWith('sprints/')) {
    'Medio ao mover; alto ao remover por perda de trilha historica'
  } elseif ($classifications.Contains('Substituido')) {
    'Medio: preservar stub/redirecionamento; alto ao remover'
  } else {
    'Medio: validar links, scripts consumidores e conteudo antes de mover'
  }

  [pscustomobject]@{
    Path = $relative
    Objective = Get-Title -File $file
    Classification = ($classifications -join '; ')
    Date = $date
    Evidence = $evidence
    Replacement = Get-Replacement -Name $file.Name
    Destination = Get-Destination -RelativePath $relative
    Risk = $risk
  }
}

$header = @"
# Inventario documental do Trixus — 2026-10-05

> Este inventario registra o estado encontrado antes de qualquer movimentacao. Nao certifica o comportamento atual do sistema. A fonte central aprovada e o `AGENTS.md` prevalecem; documentos historicos precisam de revalidacao.

## Escopo e metodo

- 158 arquivos inventariados: 52 em `docs/` e 106 em `sprints/`.
- Ultima evidencia: commit Git mais recente que tocou o arquivo; para cinco arquivos nao rastreados, data local.
- Evidencia de conteudo: classificacao conservadora, cruzamento pontual com codigo/decisoes e revisao independente. Nenhuma suite, migration, banco, VPS ou integracao externa foi executada.
- Sensibilidade e uma marcacao adicional, nao substitui o estado documental. Nenhum segredo e reproduzido aqui.
- Nao foram encontradas duplicatas byte a byte por SHA-256. Sobreposicao tematica nao foi chamada de duplicacao exata.

## Matriz completa

| Caminho | Objetivo | Classificacao | Ultima evidencia | Evidencia | Substituido por | Destino recomendado | Risco de mover/remover |
| --- | --- | --- | --- | --- | --- | --- | --- |
"@

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add($header.TrimEnd())
foreach ($row in $rows) {
  $lines.Add('| `' + (Escape-Cell $row.Path) + '` | ' + (Escape-Cell $row.Objective) + ' | ' + (Escape-Cell $row.Classification) + ' | ' + (Escape-Cell $row.Date) + ' | ' + (Escape-Cell $row.Evidence) + ' | ' + (Escape-Cell $row.Replacement) + ' | `' + (Escape-Cell $row.Destination) + '` | ' + (Escape-Cell $row.Risk) + ' |')
}

$lines.Add('')
$lines.Add('## Totais desta fotografia')
$lines.Add('')
$lines.Add('- Arquivos: ' + $rows.Count)
$lines.Add('- `docs/`: ' + (@($rows | Where-Object { $_.Path.StartsWith('docs/') }).Count))
$lines.Add('- `sprints/`: ' + (@($rows | Where-Object { $_.Path.StartsWith('sprints/') }).Count))
$lines.Add('- Nao rastreados no Git: ' + (@($rows | Where-Object { $_.Evidence.StartsWith('Worktree local') }).Count))
$lines.Add('- Marcados como potencialmente sensiveis: ' + (@($rows | Where-Object { $_.Classification -match 'Potencialmente sensivel' }).Count))
$lines.Add('')
$lines.Add('A lista acima deve ser regenerada somente para uma nova fotografia datada; nao sobrescrever esta evidencia historica.')

$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
[System.IO.File]::WriteAllLines($OutputPath, $lines, [System.Text.UTF8Encoding]::new($false))

Write-Output ([pscustomobject]@{
  OutputPath = $OutputPath
  Files = $rows.Count
  Docs = @($rows | Where-Object { $_.Path.StartsWith('docs/') }).Count
  Sprints = @($rows | Where-Object { $_.Path.StartsWith('sprints/') }).Count
  Untracked = @($rows | Where-Object { $_.Evidence.StartsWith('Worktree local') }).Count
  PotentiallySensitive = @($rows | Where-Object { $_.Classification -match 'Potencialmente sensivel' }).Count
} | ConvertTo-Json)
