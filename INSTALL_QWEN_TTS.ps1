$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$VenvName = ".venv-tts-311"
$PythonVersion = "3.11"

$wheelName = "flash_attn-2.8.3+cu128torch2.8.0cxx11abiFALSE-cp311-cp311-win_amd64.whl"
$wheelUrl = "https://huggingface.co/Jmica/flash_attention/blob/main/flash_attn-2.8.3%2Bcu128torch2.8.0cxx11abiFALSE-cp311-cp311-win_amd64.whl?download=1"
$wheelPath = Join-Path $ProjectRoot $wheelName
$altWheelName = "flash_attn-2.8.3%2Bcu128torch2.8.0cxx11abiFALSE-cp311-cp311-win_amd64.whl"
$altWheelPath = Join-Path $ProjectRoot $altWheelName

$torchIndexUrl = "https://download.pytorch.org/whl/cu128"

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
  return ,$updated
}

if (Test-Path $wheelPath) {
  Write-Host "Wheel already exists: $wheelName"
} elseif (Test-Path $altWheelPath) {
  Write-Host "Found wheel with encoded name. Renaming to: $wheelName"
  Rename-Item -Path $altWheelPath -NewName $wheelName
} else {
  Write-Host "Downloading $wheelName..."
  Invoke-WebRequest -Uri $wheelUrl -OutFile $wheelPath
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

Write-Host "Installing qwen-tts and dependencies..."
& $uvExe pip install --python $pythonExe -U pip
& $uvExe pip install --python $pythonExe -U qwen-tts soundfile

Write-Host "Installing torch from $torchIndexUrl..."
& $uvExe pip install --python $pythonExe torch --index-url $torchIndexUrl

Write-Host "Installing FlashAttention2 wheel..."
& $uvExe pip install --python $pythonExe $wheelPath

if (-not (Get-Command sox -ErrorAction SilentlyContinue)) {
  Write-Warning "SoX not found. Install with: winget install --id=SoX.SoX -e"
} else {
  Write-Host "SoX found."
}

$envPath = Join-Path $ProjectRoot ".env"
$envLines = @()
if (Test-Path $envPath) {
  $envLines = Get-Content $envPath
}
$envLines = Ensure-EnvValue $envLines "QWEN_TTS_PYTHON" $pythonExe
$envLines = Ensure-EnvValue $envLines "QWEN_TTS_ATTN_IMPLEMENTATION" "flash_attention_2"
Set-Content -Path $envPath -Value $envLines

Write-Host "Done. Updated .env with QWEN_TTS_PYTHON and QWEN_TTS_ATTN_IMPLEMENTATION."
