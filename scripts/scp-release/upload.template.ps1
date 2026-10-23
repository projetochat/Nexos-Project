param(
  [string]$HostName = "145.223.93.10",
  [string]$UserName = "root"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$PackageDirectory = "__PACKAGE_DIRECTORY__"
$RemoteDirectory = "__REMOTE_DIRECTORY__"

if (-not (Test-Path -LiteralPath $PackageDirectory -PathType Container)) {
  throw "Pacote local ausente: $PackageDirectory"
}

$files = @(Get-ChildItem -LiteralPath $PackageDirectory -File | ForEach-Object FullName)
if ($files.Count -eq 0) { throw "Pacote local vazio" }

& ssh "${UserName}@${HostName}" "test ! -e '$RemoteDirectory' && install -d -o root -g root -m 700 '$RemoteDirectory'"
if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel preparar o diretorio remoto" }

& scp @files "${UserName}@${HostName}:$RemoteDirectory/"
if ($LASTEXITCODE -ne 0) { throw "Falha ao transferir o pacote" }

Write-Host "PACOTE_ENVIADO_OK"
Write-Host "Proximo comando na VPS: bash $RemoteDirectory/release.sh PLAN"
