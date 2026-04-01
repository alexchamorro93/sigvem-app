$projectRoot = Split-Path -Parent $PSScriptRoot
$backupDir = Join-Path $projectRoot "backups"
$backupLog = Join-Path $backupDir "backup-task.log"

if (!(Test-Path $backupDir)) {
  New-Item -ItemType Directory -Path $backupDir | Out-Null
}

Set-Location $projectRoot
npm run firebase:backup:email *>> $backupLog
