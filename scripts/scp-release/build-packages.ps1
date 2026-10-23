param(
  [string]$Commit = "HEAD",
  [string]$EnvironmentFile = ".env"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Repository = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function Invoke-Native([string]$Program, [string[]]$Arguments) {
  & $Program @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Program falhou com codigo $LASTEXITCODE"
  }
}

function Read-EnvValue([string]$Path, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return "" }
  $line = Get-Content -LiteralPath $Path |
    Where-Object { $_ -match "^$([regex]::Escape($Name))=" } |
    Select-Object -Last 1
  if (-not $line) { return "" }
  return ($line -split "=", 2)[1].Trim().Trim('"').Trim("'")
}

function Write-Lf([string]$Path, [string]$Content) {
  $normalized = $Content.Replace("`r`n", "`n").Replace("`r", "`n")
  if (-not $normalized.EndsWith("`n")) { $normalized += "`n" }
  [System.IO.File]::WriteAllText($Path, $normalized, $Utf8NoBom)
}

function Expand-Template([string]$TemplatePath, [hashtable]$Values) {
  $content = Get-Content -Raw -LiteralPath $TemplatePath
  foreach ($name in $Values.Keys) {
    $content = $content.Replace("__$name`__", [string]$Values[$name])
  }
  if ($content -match '__[A-Z_]+__') {
    throw "Placeholder nao resolvido em $TemplatePath"
  }
  return $content
}

function Compress-Gzip([string]$Source, [string]$Destination) {
  $inputStream = [System.IO.File]::OpenRead($Source)
  try {
    $outputStream = [System.IO.File]::Create($Destination)
    try {
      $gzip = [System.IO.Compression.GZipStream]::new(
        $outputStream,
        [System.IO.Compression.CompressionLevel]::Fastest,
        $false
      )
      try { $inputStream.CopyTo($gzip) } finally { $gzip.Dispose() }
    } finally { $outputStream.Dispose() }
  } finally { $inputStream.Dispose() }
}

function Assert-Image(
  [string]$Tag,
  [string]$ExpectedSha,
  [string]$ExpectedTree,
  [string]$ExpectedUser = ""
) {
  $image = (& docker image inspect $Tag | ConvertFrom-Json)[0]
  if ($LASTEXITCODE -ne 0) { throw "Imagem ausente: $Tag" }
  if ($image.Os -ne "linux" -or $image.Architecture -ne "amd64") {
    throw "Arquitetura invalida em $Tag"
  }
  if ($image.Config.Labels.'org.opencontainers.image.revision' -ne $ExpectedSha) {
    throw "Revision label divergente em $Tag"
  }
  if ($image.Config.Labels.'io.trixus.source-tree' -ne $ExpectedTree) {
    throw "Tree label divergente em $Tag"
  }
  if ($ExpectedUser -and $image.Config.User -ne $ExpectedUser) {
    throw "Usuario da imagem divergente em $Tag"
  }
  return $image
}

function Assert-ExactEnvironment([object]$Image, [hashtable]$Expected) {
  $items = @($Image.Config.Env)
  foreach ($name in $Expected.Keys) {
    $line = "$name=$($Expected[$name])"
    if (@($items | Where-Object { $_ -eq $line }).Count -ne 1) {
      throw "Variavel incorporada ausente ou duplicada: $line"
    }
  }
}

function Test-Frontend([string]$Tag, [string[]]$Required, [string[]]$Forbidden) {
  $name = "trixus-release-smoke-$([guid]::NewGuid().ToString('N').Substring(0, 12))"
  try {
    Invoke-Native docker @("run", "-d", "--name", $name, "--read-only", "--tmpfs", "/tmp", $Tag)
    $ready = $false
    foreach ($attempt in 1..30) {
      & docker exec $name bun -e "fetch('http://127.0.0.1:4173/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" 2>$null
      if ($LASTEXITCODE -eq 0) { $ready = $true; break }
      Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw "Frontend nao respondeu no smoke test: $Tag" }

    foreach ($value in $Required) {
      & docker exec $name sh -ec "grep -R -F -q -- '$value' /app/.output"
      if ($LASTEXITCODE -ne 0) { throw "Destino obrigatorio ausente em ${Tag}: $value" }
    }
    foreach ($value in $Forbidden) {
      & docker exec $name sh -ec "! grep -R -F -q -- '$value' /app/.output"
      if ($LASTEXITCODE -ne 0) { throw "Destino proibido encontrado em ${Tag}: $value" }
    }
  } finally {
    & docker rm -f $name *> $null
  }
}

function Write-Package(
  [string]$Directory,
  [string]$Environment,
  [string]$Sha,
  [string]$Tree,
  [string]$SourceHash,
  [string[]]$Tags,
  [System.Collections.IDictionary]$PublicConfiguration
) {
  New-Item -ItemType Directory -Path $Directory | Out-Null
  $rawArchive = Join-Path $Directory "images.tar"
  Invoke-Native docker (@("save", "--output", $rawArchive) + $Tags)
  Compress-Gzip $rawArchive (Join-Path $Directory "images.tar.gz")
  Remove-Item -LiteralPath $rawArchive

  $lines = foreach ($tag in $Tags) {
    $image = (& docker image inspect $tag | ConvertFrom-Json)[0]
    $service = ($tag -split "/")[-1].Split(":")[0]
    "$service|$tag|$($image.Id)|$($image.Architecture)|$Sha|$Tree"
  }
  Write-Lf (Join-Path $Directory "images.txt") ($lines -join "`n")
  Write-Lf (Join-Path $Directory "commit.txt") $Sha
  Write-Lf (Join-Path $Directory "tree.txt") $Tree

  $contract = [ordered]@{
    schema = 1
    environment = $Environment
    commit = $Sha
    tree = $Tree
    sourceArchiveSha256 = $SourceHash
    platform = "linux/amd64"
    tags = $Tags
    publicConfiguration = $PublicConfiguration
    generatedAtUtc = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
  } | ConvertTo-Json -Depth 5
  Write-Lf (Join-Path $Directory "release-contract.json") $contract

  $shortSha = $Sha.Substring(0, 8)
  if ($Environment -eq "homologation") {
    $releaseValues = @{
      ENVIRONMENT = "homologation"
      SHA = $Sha
      SHORT_SHA = $shortSha
      STATE_DIR = "/var/lib/trixus-hml-release"
      RUNNER = "/usr/local/sbin/trixus-hml-release"
      ENV_FILE = "/opt/trixus-hml/app/.env.vps"
      EXPECTED_APP = $PublicConfiguration.platform
      EXPECTED_API = $PublicConfiguration.api
      EXPECTED_MODE = $PublicConfiguration.mode
      DEPLOY_TOKEN = "DEPLOY_HML_$($shortSha.ToUpperInvariant())"
    }
  } else {
    $releaseValues = @{
      ENVIRONMENT = "production"
      SHA = $Sha
      SHORT_SHA = $shortSha
      STATE_DIR = "/var/lib/trixus-production"
      RUNNER = "/usr/local/sbin/trixus-release"
      ENV_FILE = "/opt/trixus/app/.env.vps"
      EXPECTED_APP = $PublicConfiguration.platform
      EXPECTED_API = $PublicConfiguration.api
      EXPECTED_MODE = $PublicConfiguration.mode
      DEPLOY_TOKEN = "DEPLOY_PRODUCTION_$($shortSha.ToUpperInvariant())"
    }
  }
  $releaseTemplate = Join-Path $Repository "scripts\scp-release\vps-release.template.sh"
  Write-Lf (Join-Path $Directory "release.sh") (Expand-Template $releaseTemplate $releaseValues)

  $checksumFiles = @(
    "images.tar.gz",
    "images.txt",
    "commit.txt",
    "tree.txt",
    "release-contract.json",
    "release.sh"
  )
  $checksums = foreach ($file in $checksumFiles) {
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $Directory $file)).Hash.ToLowerInvariant()
    "$hash  $file"
  }
  Write-Lf (Join-Path $Directory "SHA256SUMS") ($checksums -join "`n")
}

Push-Location $Repository
$scratch = $null
try {
  Invoke-Native git @("rev-parse", "--is-inside-work-tree")
  $Sha = (& git rev-parse "$Commit^{commit}").Trim().ToLowerInvariant()
  $Tree = (& git rev-parse "$Sha^{tree}").Trim().ToLowerInvariant()
  if ($Sha -notmatch '^[0-9a-f]{40}$' -or $Tree -notmatch '^[0-9a-f]{40}$') {
    throw "Commit ou tree invalido"
  }
  if ((& git status --porcelain --untracked-files=all).Count -ne 0) {
    throw "A arvore precisa estar limpa e inteiramente commitada antes do empacotamento."
  }

  $envPath = if ([IO.Path]::IsPathRooted($EnvironmentFile)) {
    $EnvironmentFile
  } else {
    Join-Path $Repository $EnvironmentFile
  }
  $supabaseUrl = Read-EnvValue $envPath "VITE_SUPABASE_URL"
  $supabaseKey = Read-EnvValue $envPath "VITE_SUPABASE_PUBLISHABLE_KEY"
  $supabaseProject = Read-EnvValue $envPath "VITE_SUPABASE_PROJECT_ID"
  $supabaseBuildMode = if ($supabaseUrl -and $supabaseKey) { "CONFIGURADO" } else { "VAZIO_COMO_COMPOSE" }
  if (($supabaseUrl -and -not $supabaseKey) -or ($supabaseKey -and -not $supabaseUrl)) {
    throw "VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY devem ser informadas juntas ou ambas permanecer vazias."
  }
  Write-Host "supabase_public_build=$supabaseBuildMode"

  $output = Join-Path $Repository ".release-artifacts\scp-$Sha"
  if (Test-Path -LiteralPath $output) {
    throw "Saida ja existe e nao sera sobrescrita: $output"
  }
  $scratch = Join-Path $Repository ".release-artifacts\.scp-build-$([guid]::NewGuid().ToString('N'))"
  $source = Join-Path $scratch "source"
  New-Item -ItemType Directory -Path $source -Force | Out-Null
  $sourceTar = Join-Path $scratch "source-$Sha.tar"
  Invoke-Native git @("archive", "--format=tar", "--output=$sourceTar", $Sha)
  Invoke-Native tar @("-xf", $sourceTar, "-C", $source)
  $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourceTar).Hash.ToLowerInvariant()

  $labels = @(
    "--label", "org.opencontainers.image.revision=$Sha",
    "--label", "io.trixus.source-tree=$Tree"
  )
  $backendBuild = "trixus-build/backend:$Sha"
  $migrateBuild = "trixus-build/migrate:$Sha"
  $hmlBackend = "trixus-hml-release/backend:$Sha"
  $hmlMigrate = "trixus-hml-release/migrate:$Sha"
  $hmlFrontend = "trixus-hml-release/frontend:$Sha"
  $prodBackend = "trixus-release/backend:$Sha"
  $prodMigrate = "trixus-release/migrate:$Sha"
  $prodFrontend = "trixus-release/frontend:$Sha"

  Invoke-Native docker (@("build", "--platform", "linux/amd64", "-f", "backend/Dockerfile", "--target", "runtime") + $labels + @("-t", $backendBuild, $source))
  Invoke-Native docker (@("build", "--platform", "linux/amd64", "-f", "backend/Dockerfile", "--target", "migrate") + $labels + @("-t", $migrateBuild, $source))
  foreach ($tag in @($hmlBackend, $prodBackend)) { Invoke-Native docker @("tag", $backendBuild, $tag) }
  foreach ($tag in @($hmlMigrate, $prodMigrate)) { Invoke-Native docker @("tag", $migrateBuild, $tag) }

  $sharedFrontendArgs = @(
    "--build-arg", "VITE_SUPABASE_URL=$supabaseUrl",
    "--build-arg", "VITE_SUPABASE_PUBLISHABLE_KEY=$supabaseKey",
    "--build-arg", "VITE_SUPABASE_PROJECT_ID=$supabaseProject"
  )
  Invoke-Native docker (@("build", "--platform", "linux/amd64", "-f", "Dockerfile.frontend") + $labels + $sharedFrontendArgs + @(
    "--build-arg", "VITE_TRIXUS_API_URL=https://api-hom.trixus.com.br/api",
    "--build-arg", "VITE_TRIXUS_PLATFORM_APP_URL=https://hom.trixus.com.br",
    "--build-arg", "VITE_TRIXUS_TENANT_APP_URL=https://hom.trixus.com.br",
    "--build-arg", "VITE_APP_MODE=homologation",
    "-t", $hmlFrontend,
    $source
  ))
  Invoke-Native docker (@("build", "--platform", "linux/amd64", "-f", "Dockerfile.frontend") + $labels + $sharedFrontendArgs + @(
    "--build-arg", "VITE_TRIXUS_API_URL=https://api.trixus.com.br/api",
    "--build-arg", "VITE_TRIXUS_PLATFORM_APP_URL=https://app.trixus.com.br",
    "--build-arg", "VITE_TRIXUS_TENANT_APP_URL=https://app.trixus.com.br",
    "--build-arg", "VITE_APP_MODE=production",
    "-t", $prodFrontend,
    $source
  ))

  $backendImage = Assert-Image $hmlBackend $Sha $Tree "bun"
  $migrateImage = Assert-Image $hmlMigrate $Sha $Tree "bun"
  $hmlFrontendImage = Assert-Image $hmlFrontend $Sha $Tree
  $prodFrontendImage = Assert-Image $prodFrontend $Sha $Tree
  if ((& docker image inspect $hmlBackend --format '{{.Id}}') -ne (& docker image inspect $prodBackend --format '{{.Id}}')) {
    throw "Backend HML e producao nao apontam para a mesma imagem"
  }
  if ((& docker image inspect $hmlMigrate --format '{{.Id}}') -ne (& docker image inspect $prodMigrate --format '{{.Id}}')) {
    throw "Migrate HML e producao nao apontam para a mesma imagem"
  }
  if (($migrateImage.Config.Cmd | ConvertTo-Json -Compress) -ne '["bun","run","prisma:migrate:deploy","--help"]') {
    throw "Comando seguro da imagem migrate foi alterado"
  }

  $hmlPublic = [ordered]@{
    api = "https://api-hom.trixus.com.br/api"
    platform = "https://hom.trixus.com.br"
    tenant = "https://hom.trixus.com.br"
    mode = "homologation"
  }
  $prodPublic = [ordered]@{
    api = "https://api.trixus.com.br/api"
    platform = "https://app.trixus.com.br"
    tenant = "https://app.trixus.com.br"
    mode = "production"
  }
  Assert-ExactEnvironment $hmlFrontendImage @{
    VITE_TRIXUS_API_URL = $hmlPublic.api
    VITE_TRIXUS_PLATFORM_APP_URL = $hmlPublic.platform
    VITE_TRIXUS_TENANT_APP_URL = $hmlPublic.tenant
    VITE_APP_MODE = $hmlPublic.mode
  }
  Assert-ExactEnvironment $prodFrontendImage @{
    VITE_TRIXUS_API_URL = $prodPublic.api
    VITE_TRIXUS_PLATFORM_APP_URL = $prodPublic.platform
    VITE_TRIXUS_TENANT_APP_URL = $prodPublic.tenant
    VITE_APP_MODE = $prodPublic.mode
  }
  Test-Frontend $hmlFrontend @($hmlPublic.api, $hmlPublic.platform) @("https://chat.trixus.com.br")
  Test-Frontend $prodFrontend @($prodPublic.api, $prodPublic.platform) @(
    "https://chat.trixus.com.br",
    "api-hom.trixus.com.br",
    "hom.trixus.com.br"
  )

  New-Item -ItemType Directory -Path $output | Out-Null
  Write-Package (Join-Path $output "hml") "homologation" $Sha $Tree $sourceHash @(
    $hmlBackend, $hmlMigrate, $hmlFrontend
  ) $hmlPublic
  Write-Package (Join-Path $output "production") "production" $Sha $Tree $sourceHash @(
    $prodBackend, $prodMigrate, $prodFrontend
  ) $prodPublic

  $uploadTemplate = Join-Path $Repository "scripts\scp-release\upload.template.ps1"
  foreach ($environment in @("hml", "production")) {
    $packageDirectory = Join-Path $output $environment
    $remoteDirectory = "/root/trixus-release-$Sha-$environment"
    $uploadScript = Expand-Template $uploadTemplate @{
      PACKAGE_DIRECTORY = $packageDirectory
      REMOTE_DIRECTORY = $remoteDirectory
    }
    Write-Lf (Join-Path $output "upload-$environment.ps1") $uploadScript
  }

  Write-Host "PACOTES_SCP_GERADOS_OK"
  Write-Host "COMMIT=$Sha"
  Write-Host "TREE=$Tree"
  Write-Host "HML=$(Join-Path $output 'hml')"
  Write-Host "PRODUCAO=$(Join-Path $output 'production')"
} finally {
  Pop-Location
  if ($scratch -and (Test-Path -LiteralPath $scratch)) {
    Remove-Item -LiteralPath $scratch -Recurse -Force
  }
}
