$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$VenvName = ".venv-tts-chatterbox"
$PythonVersion = "3.11"
$torchIndexUrl = "https://download.pytorch.org/whl/cu124"

function Resolve-Uv {
  $cmd = Get-Command uv -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }
  $candidates = @(
    (Join-Path $env:USERPROFILE ".cargo\bin\uv.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\uv\uv.exe")
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }
  return $null
}

function Ensure-EnvValue([string[]]$lines, [string]$key, [string]$value) {
  $pattern = "^$key="
  $found = $false
  $updated = $lines | ForEach-Object {
    if ($_ -match $pattern) {
      $found = $true
      return "$key=$value"
    }
    return $_
  }
  if (-not $found) {
    $updated += "$key=$value"
  }
  return , $updated
}

$uvExe = Resolve-Uv
if (-not $uvExe) {
  Write-Host "Installing uv..."
  powershell -ExecutionPolicy ByPass -Command "irm https://astral.sh/uv/install.ps1 | iex"
  $uvExe = Resolve-Uv
}
if (-not $uvExe) {
  throw "uv not found in PATH after installation."
}

Write-Host "Creating/updating venv: $VenvName (Python $PythonVersion)"
& $uvExe venv -p $PythonVersion $VenvName

$pythonExe = Join-Path $ProjectRoot "$VenvName\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
  throw "Python executable not found at $pythonExe"
}

Write-Host "Installing torch/torchaudio from $torchIndexUrl..."
& $uvExe pip install --python $pythonExe -U pip
& $uvExe pip install --python $pythonExe torch==2.6.0 torchaudio==2.6.0 --index-url $torchIndexUrl

Write-Host "Installing chatterbox-tts..."
& $uvExe pip install --python $pythonExe chatterbox-tts soundfile

$voicesDir = Join-Path $ProjectRoot "data\voices"
if (-not (Test-Path $voicesDir)) {
  New-Item -ItemType Directory -Path $voicesDir | Out-Null
}
$voicesIndex = Join-Path $ProjectRoot "data\voices.json"
if (-not (Test-Path $voicesIndex)) {
  Write-Warning "voices.json not found. Create one in $voicesIndex."
}

$envPath = Join-Path $ProjectRoot ".env"
$envLines = @()
if (Test-Path $envPath) {
  $envLines = Get-Content $envPath
}
$envLines = Ensure-EnvValue $envLines "TTS_PROVIDER" "chatterbox"
$envLines = Ensure-EnvValue $envLines "CHATTERBOX_PYTHON" $pythonExe
$envLines = Ensure-EnvValue $envLines "CHATTERBOX_DEVICE" "cuda"
$envLines = Ensure-EnvValue $envLines "CHATTERBOX_LANGUAGE" "pt"
$envLines = Ensure-EnvValue $envLines "CHATTERBOX_VOICE_ID" "h-adulto-grave"
$envLines = Ensure-EnvValue $envLines "TTS_VOICES_DIR" $voicesDir
$envLines = Ensure-EnvValue $envLines "TTS_VOICES_INDEX" $voicesIndex
Set-Content -Path $envPath -Value $envLines

Write-Host "Done. Updated .env with TTS_PROVIDER and Chatterbox settings."
