param(
  [string]$TaskName = "SIGVEM_DailyBackup",
  [string]$BackupTime = "00:00"
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$backupLog = Join-Path $projectRoot "backups\backup-task.log"
$cmd = ('cmd /c "cd /d ""{0}"" && npm run firebase:backup >> ""{1}"" 2>&1"' -f $projectRoot, $backupLog)

Write-Host "Configurando tarea programada diaria..." -ForegroundColor Cyan
Write-Host "Tarea: $TaskName"
Write-Host "Hora:  $BackupTime"
Write-Host "Ruta:  $projectRoot"

schtasks /Query /TN $TaskName *> $null
if ($LASTEXITCODE -eq 0) {
  schtasks /Delete /TN $TaskName /F | Out-Null
}

schtasks /Create /F /SC DAILY /ST $BackupTime /TN $TaskName /TR $cmd | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Error "No se pudo crear la tarea programada."
  exit 1
}

Write-Host "OK: tarea creada correctamente." -ForegroundColor Green
Write-Host "Puedes verificarla con: schtasks /Query /TN $TaskName /V /FO LIST"
