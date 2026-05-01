param(
  [string]$ServerDir = ""
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$VenvName = ".venv-tts-xtts"
$PythonVersion = "3.11"
$torchVersion = "2.1.1"
$torchaudioVersion = "2.1.1"
$torchIndexUrl = "https://download.pytorch.org/whl/cu121"

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

if (-not $ServerDir) {
  $ServerDir = Join-Path $ProjectRoot "tools\xtts-api-server"
}
if (-not (Test-Path $ServerDir)) {
  throw "XTTS API server directory not found. Pass -ServerDir with the xtts-api-server path."
}

Write-Host "Creating/updating venv: $VenvName (Python $PythonVersion)"
& $uvExe venv -p $PythonVersion $VenvName

$pythonExe = Join-Path $ProjectRoot "$VenvName\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
  throw "Python executable not found at $pythonExe"
}

Write-Host "Installing torch/torchaudio from $torchIndexUrl..."
& $uvExe pip install --python $pythonExe -U pip
& $uvExe pip install --python $pythonExe "torch==$torchVersion" "torchaudio==$torchaudioVersion" --index-url $torchIndexUrl

Write-Host "Installing xtts-api-server from $ServerDir..."
& $uvExe pip install --python $pythonExe -e $ServerDir

$dataDir = Join-Path $ProjectRoot "data"
$voicesDir = Join-Path $dataDir "voices"
$voicesIndex = Join-Path $dataDir "voices.json"
$modelDir = Join-Path $dataDir "xtts_models"
$outputDir = Join-Path $dataDir "xtts_output"
$serverSpeakersDir = Join-Path $ServerDir "speakers"

if (-not (Test-Path $voicesDir)) {
  New-Item -ItemType Directory -Path $voicesDir | Out-Null
}
if (-not (Test-Path $modelDir)) {
  New-Item -ItemType Directory -Path $modelDir | Out-Null
}
if (-not (Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}
if (-not (Test-Path $voicesIndex)) {
  Write-Warning "voices.json not found. Create one in $voicesIndex."
}

$envPath = Join-Path $ProjectRoot ".env"
$envLines = @()
if (Test-Path $envPath) {
  $envLines = Get-Content $envPath
}
$envLines = Ensure-EnvValue $envLines "TTS_PROVIDER" "xtts"
$envLines = Ensure-EnvValue $envLines "XTTS_API_PYTHON" $pythonExe
$envLines = Ensure-EnvValue $envLines "XTTS_API_SERVER_DIR" $ServerDir
$envLines = Ensure-EnvValue $envLines "XTTS_API_BASE_URL" "http://127.0.0.1:8020"
$envLines = Ensure-EnvValue $envLines "XTTS_API_MODEL_DIR" $modelDir
$speakerDirValue = $voicesDir
if (Test-Path $serverSpeakersDir) {
  $speakerDirValue = $serverSpeakersDir
}
$envLines = Ensure-EnvValue $envLines "XTTS_API_SPEAKER_DIR" $speakerDirValue
$envLines = Ensure-EnvValue $envLines "XTTS_API_OUTPUT_DIR" $outputDir
$envLines = Ensure-EnvValue $envLines "XTTS_API_MODEL_SOURCE" "local"
$envLines = Ensure-EnvValue $envLines "XTTS_API_MODEL_VERSION" "v2.0.2"
$envLines = Ensure-EnvValue $envLines "XTTS_API_DEVICE" "cuda"
$envLines = Ensure-EnvValue $envLines "XTTS_API_USE_CACHE" "true"
$envLines = Ensure-EnvValue $envLines "XTTS_API_LOWVRAM" "false"
$envLines = Ensure-EnvValue $envLines "XTTS_API_DEEPSPEED" "false"
$envLines = Ensure-EnvValue $envLines "XTTS_API_AUTOSTART" "true"
$envLines = Ensure-EnvValue $envLines "XTTS_API_DETACH" "false"
$envLines = Ensure-EnvValue $envLines "XTTS_LANGUAGE" "pt"
$envLines = Ensure-EnvValue $envLines "XTTS_VOICE_ID" "h-adulto-grave"
$envLines = Ensure-EnvValue $envLines "TTS_VOICES_DIR" $voicesDir
$envLines = Ensure-EnvValue $envLines "TTS_VOICES_INDEX" $voicesIndex
Set-Content -Path $envPath -Value $envLines

Write-Host "Done. Updated .env with XTTS settings."
