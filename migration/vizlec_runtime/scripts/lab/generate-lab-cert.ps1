param(
  [string]$Domain = "control.vizlec-dev.test",
  [string]$OutDir = "infra/lab/certs",
  [switch]$SkipAutoInstall
)

$ErrorActionPreference = "Stop"

function Test-CommandExists {
  param([Parameter(Mandatory = $true)][string]$CommandName)
  return [bool](Get-Command $CommandName -ErrorAction SilentlyContinue)
}

function Install-MkcertWithWinget {
  if (-not (Test-CommandExists -CommandName "winget")) {
    return $false
  }
  Write-Host "Tentando instalar mkcert via winget..."
  winget install -e --id FiloSottile.mkcert --accept-source-agreements --accept-package-agreements
  return (Test-CommandExists -CommandName "mkcert")
}

function Install-MkcertWithChoco {
  if (-not (Test-CommandExists -CommandName "choco")) {
    return $false
  }
  Write-Host "Tentando instalar mkcert via choco..."
  choco install mkcert -y
  return (Test-CommandExists -CommandName "mkcert")
}

function Install-MkcertWithScoop {
  if (-not (Test-CommandExists -CommandName "scoop")) {
    return $false
  }
  Write-Host "Tentando instalar mkcert via scoop..."
  scoop install mkcert
  return (Test-CommandExists -CommandName "mkcert")
}

if (-not (Test-CommandExists -CommandName "mkcert")) {
  if ($SkipAutoInstall) {
    throw "mkcert não encontrado e -SkipAutoInstall foi usado. Instale manualmente e rode novamente."
  }

  $installed = $false
  $installed = $installed -or (Install-MkcertWithWinget)
  $installed = $installed -or (Install-MkcertWithChoco)
  $installed = $installed -or (Install-MkcertWithScoop)

  if (-not $installed) {
    throw @"
mkcert não encontrado e a instalação automática falhou.
Instale manualmente uma das opções:
1) winget install -e --id FiloSottile.mkcert
2) choco install mkcert -y
3) scoop install mkcert
Depois execute novamente este script.
"@
  }
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Write-Host "Instalando CA local no trust store (se ainda não existir)..."
mkcert -install | Out-Null

$certPath = Join-Path $OutDir "$Domain.pem"
$keyPath = Join-Path $OutDir "$Domain-key.pem"

Write-Host "Gerando certificado para $Domain..."
mkcert -cert-file $certPath -key-file $keyPath $Domain

Write-Host "Certificado gerado em:"
Write-Host " - $certPath"
Write-Host " - $keyPath"
