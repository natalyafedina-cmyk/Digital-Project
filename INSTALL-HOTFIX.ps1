param(
  [string]$ProjectPath = "C:\Users\PC\ai-tutor-sofia"
)

$ErrorActionPreference = "Stop"
$PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot = Join-Path $ProjectPath "_backup-adaptive-hotfix-$Stamp"

$files = @(
  "app\api\tutor\route.ts",
  "app\subject\[subject]\[mode]\page.tsx"
)

New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null

foreach ($relative in $files) {
  $packageFile = Join-Path $PackageRoot $relative
  $projectFile = Join-Path $ProjectPath $relative

  if (Test-Path -LiteralPath $projectFile) {
    $backupFile = Join-Path $BackupRoot $relative
    $backupDir = Split-Path -Parent $backupFile
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    Copy-Item -LiteralPath $projectFile -Destination $backupFile -Force
  }

  $projectDir = Split-Path -Parent $projectFile
  New-Item -ItemType Directory -Path $projectDir -Force | Out-Null
  Copy-Item -LiteralPath $packageFile -Destination $projectFile -Force
}

Write-Host ""
Write-Host "Adaptive Hotfix v1.1 installed." -ForegroundColor Green
Write-Host "Backup: $BackupRoot" -ForegroundColor Yellow
Write-Host ""
Write-Host "Restart npm run dev and test a NEW lesson." -ForegroundColor Cyan
