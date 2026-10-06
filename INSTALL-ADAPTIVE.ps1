param(
  [string]$ProjectPath = "C:\Users\PC\ai-tutor-sofia"
)

$ErrorActionPreference = "Stop"

$PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot = Join-Path $ProjectPath "_backup-adaptive-core-$Stamp"

Write-Host ""
Write-Host "AI Tutor Sofia - Adaptive Learning Core v1" -ForegroundColor Cyan
Write-Host "Project: $ProjectPath"
Write-Host ""

if (!(Test-Path -LiteralPath $ProjectPath)) {
  throw "Project folder not found: $ProjectPath"
}

$files = @(
  "lib\adaptive-learning.ts",
  "app\api\tutor\route.ts",
  "app\api\parent-chat\route.ts",
  "app\subject\[subject]\[mode]\page.tsx",
  "app\subject\[subject]\page.tsx",
  "app\parent\page.tsx"
)

New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null

foreach ($relative in $files) {
  $packageFile = Join-Path $PackageRoot $relative
  $projectFile = Join-Path $ProjectPath $relative

  if (!(Test-Path -LiteralPath $packageFile)) {
    throw "Package file missing: $relative"
  }

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
Write-Host "Adaptive Core files installed." -ForegroundColor Green
Write-Host "Backup: $BackupRoot" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "1) Run supabase\ADAPTIVE-CORE-v1.sql in Supabase SQL Editor"
Write-Host "2) Stop the old dev server"
Write-Host "3) Run npm run dev from $ProjectPath"
Write-Host "4) Open http://localhost:3000"
