param(
  [Parameter(Mandatory = $true)]
  [int]$Port
)

$connections = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
if (-not $connections -or $connections.Count -eq 0) {
  Write-Host "No listening process found on port $Port."
  exit 0
}

$pids = $connections |
  Select-Object -ExpandProperty OwningProcess -Unique |
  Where-Object { $_ -and $_ -gt 0 }

foreach ($pid in $pids) {
  try {
    Write-Host "Killing PID $pid on port $Port (process tree)..."
    taskkill /PID $pid /T /F | Out-Null
  } catch {
    Write-Warning "Failed to kill PID $pid: $($_.Exception.Message)"
  }
}

exit 0
