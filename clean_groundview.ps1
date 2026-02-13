# GroundView Complete Cleanup Script
# Run this PowerShell script to remove all GroundView data

Write-Host "===================================" -ForegroundColor Cyan
Write-Host "GroundView Complete Cleanup" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will delete:" -ForegroundColor Yellow
Write-Host "  - Application settings and API keys"
Write-Host "  - Cache and temporary files"
Write-Host "  - Log files"
Write-Host "  - PaddleOCR model cache"
Write-Host ""

$confirmation = Read-Host "Are you sure you want to continue? (Y/N)"
if ($confirmation -ne 'Y' -and $confirmation -ne 'y') {
    Write-Host "Cleanup cancelled." -ForegroundColor Yellow
    exit
}

Write-Host ""
Write-Host "[1/4] Removing AppData\Roaming\GroundView..." -ForegroundColor Green
$roamingPath = Join-Path $env:APPDATA "GroundView"
if (Test-Path $roamingPath) {
    Remove-Item -Path $roamingPath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   ✓ Deleted: $roamingPath" -ForegroundColor Green
} else {
    Write-Host "   - Not found: $roamingPath" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[2/4] Removing AppData\Local\GroundView..." -ForegroundColor Green
$localPath = Join-Path $env:LOCALAPPDATA "GroundView"
if (Test-Path $localPath) {
    Remove-Item -Path $localPath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   ✓ Deleted: $localPath" -ForegroundColor Green
} else {
    Write-Host "   - Not found: $localPath" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[3/4] Removing PaddleOCR cache..." -ForegroundColor Green
$paddlePath = Join-Path $env:USERPROFILE ".paddleocr"
if (Test-Path $paddlePath) {
    Remove-Item -Path $paddlePath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   ✓ Deleted: $paddlePath" -ForegroundColor Green
} else {
    Write-Host "   - Not found: $paddlePath" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[4/4] Removing development user-data folder..." -ForegroundColor Green
$devDataPath = Join-Path $PSScriptRoot "user-data"
if (Test-Path $devDataPath) {
    Remove-Item -Path $devDataPath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   ✓ Deleted: $devDataPath" -ForegroundColor Green
} else {
    Write-Host "   - Not found: $devDataPath" -ForegroundColor Gray
}

Write-Host ""
Write-Host "===================================" -ForegroundColor Cyan
Write-Host "Cleanup Complete!" -ForegroundColor Green
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "All GroundView data has been removed." -ForegroundColor Green
Write-Host "You can now reinstall or the app is fully uninstalled." -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter to exit"
