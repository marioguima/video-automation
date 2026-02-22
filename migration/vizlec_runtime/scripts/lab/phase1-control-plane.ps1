param(
  [string]$Domain = "control.vizlec-dev.test",
  [string]$LabEnvPath = "infra/lab/.env",
  [switch]$SkipCert,
  [switch]$SkipUp
)

$ErrorActionPreference = "Stop"

function Set-Or-AppendEnvVar {
  param(
    [string]$Path,
    [string]$Name,
    [string]$Value
  )
  $content = if (Test-Path $Path) { Get-Content -Raw $Path } else { "" }
  $pattern = "(?m)^$([Regex]::Escape($Name))=.*$"
  $line = "$Name=$Value"
  if ($content -match $pattern) {
    $updated = [Regex]::Replace($content, $pattern, $line)
    Set-Content -Path $Path -Value $updated -NoNewline
  } else {
    if ($content.Length -gt 0 -and -not $content.EndsWith("`n")) {
      $content += "`r`n"
    }
    $content += "$line`r`n"
    Set-Content -Path $Path -Value $content -NoNewline
  }
}

Write-Host "== Fase 1 / control plane (eternidade-server) =="
Write-Host "Domínio: $Domain"

if (-not (Test-Path $LabEnvPath)) {
  Copy-Item -Path "infra/lab/.env.example" -Destination $LabEnvPath
  Write-Host "Arquivo criado: $LabEnvPath"
}

Set-Or-AppendEnvVar -Path $LabEnvPath -Name "WEB_APP_BASE_URL" -Value "https://$Domain"

$dynamicPath = "infra/lab/traefik/dynamic.yml"
if (-not (Test-Path $dynamicPath)) {
  throw "Arquivo não encontrado: $dynamicPath"
}

$dynamic = Get-Content -Raw $dynamicPath
$dynamic = [Regex]::Replace($dynamic, "Host\(`[^`]+`\)", "Host(`$Domain`)")
$dynamic = [Regex]::Replace(
  $dynamic,
  "(?m)^\s*-\s+certFile:\s+/etc/certs/.*$",
  "    - certFile: /etc/certs/$Domain.pem"
)
$dynamic = [Regex]::Replace(
  $dynamic,
  "(?m)^\s*keyFile:\s+/etc/certs/.*$",
  "      keyFile: /etc/certs/$Domain-key.pem"
)
Set-Content -Path $dynamicPath -Value $dynamic -NoNewline

if (-not $SkipCert) {
  & "scripts/lab/generate-lab-cert.ps1" -Domain $Domain
}

if (-not (Test-Path "infra/lab/certs/$Domain.pem")) {
  throw "Certificado não encontrado em infra/lab/certs/$Domain.pem"
}
if (-not (Test-Path "infra/lab/certs/$Domain-key.pem")) {
  throw "Chave não encontrada em infra/lab/certs/$Domain-key.pem"
}

docker compose --env-file $LabEnvPath -f infra/lab/docker-compose.yml config | Out-Null
Write-Host "docker compose config: OK"

if (-not $SkipUp) {
  docker compose --env-file $LabEnvPath -f infra/lab/docker-compose.yml up -d --build
  Write-Host "Stack iniciada."
}

Write-Host "Próximo passo: exportar CA do control plane para developer e deus-server."
Write-Host "Comando para descobrir CAROOT: mkcert -CAROOT"
