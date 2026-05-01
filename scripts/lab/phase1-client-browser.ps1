param(
  [Parameter(Mandatory = $true)][string]$ServerIp,
  [string]$Domain = "control.vizlec-dev.test",
  [string]$HostsPath = "$env:SystemRoot\System32\drivers\etc\hosts",
  [Parameter(Mandatory = $true)][string]$CaCertPath,
  [switch]$SkipHosts,
  [switch]$SkipCertImport
)

$ErrorActionPreference = "Stop"

function Ensure-HostsEntry {
  param(
    [string]$Path,
    [string]$Ip,
    [string]$Host
  )

  if (-not (Test-Path $Path)) {
    throw "Arquivo hosts não encontrado: $Path"
  }

  $existing = Get-Content -Raw $Path
  $pattern = "(?m)^\s*$([Regex]::Escape($Ip))\s+$([Regex]::Escape($Host))\s*$"
  if ($existing -match $pattern) {
    Write-Host "Entrada hosts já existe."
    return
  }

  $line = "$Ip $Host"
  Add-Content -Path $Path -Value $line
  Write-Host "Entrada adicionada no hosts: $line"
}

Write-Host "== Fase 1 / client-browser (developer) =="
Write-Host "Servidor: $ServerIp"
Write-Host "Domínio: $Domain"

if (-not $SkipHosts) {
  Ensure-HostsEntry -Path $HostsPath -Ip $ServerIp -Host $Domain
}

if (-not $SkipCertImport) {
  if (-not (Test-Path $CaCertPath)) {
    throw "Certificado da CA não encontrado: $CaCertPath"
  }
  Import-Certificate -FilePath $CaCertPath -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
  Write-Host "CA importada em Cert:\CurrentUser\Root"
}

Write-Host "Teste de resolução:"
ping $Domain -n 1

Write-Host "Teste TLS (health):"
curl.exe -vk "https://$Domain/health"
