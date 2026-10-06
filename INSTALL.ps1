param(
  [string]$ProjectPath = "C:\Users\PC\ai-tutor-sofia"
)

$ErrorActionPreference = "Stop"

$PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot = Join-Path $ProjectPath "_backup-smart-core-$Stamp"

Write-Host ""
Write-Host "AI Tutor Sofia - Smart Core installer" -ForegroundColor Cyan
Write-Host "Project: $ProjectPath"
Write-Host ""

if (!(Test-Path $ProjectPath)) {
  throw "Project folder not found: $ProjectPath"
}

$targets = @(
  "app\page.tsx",
  "app\parent\page.tsx",
  "app\subject\[subject]\[mode]\page.tsx",
  "app\api\tutor\route.ts",
  "app\api\speech\route.ts",
  "lib\supabase\client.ts"
)

New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null

foreach ($relative in $targets) {
  $source = Join-Path $ProjectPath $relative
  if (Test-Path -LiteralPath $source) {
    $backup = Join-Path $BackupRoot $relative
    $backupDir = Split-Path -Parent $backup
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $backup -Force
  }
}

$folders = @("app", "components", "lib")
foreach ($folder in $folders) {
  $from = Join-Path $PackageRoot $folder
  $to = Join-Path $ProjectPath $folder

  if (Test-Path $from) {
    Copy-Item -Path "$from\*" -Destination $to -Recurse -Force
  }
}

Write-Host ""
Write-Host "Files installed." -ForegroundColor Green
Write-Host "Backup: $BackupRoot" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "1) Run supabase\SMART-CORE.sql in Supabase SQL Editor"
Write-Host "2) Restart npm run dev"
Write-Host "3) Open http://localhost:3000"
