# Packages the webOS app directory into an .ipk file.
param(
    [string]$Device = ""
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

if (-not (Get-Command ares-package -ErrorAction SilentlyContinue)) {
    Write-Error "ares-package not found. Install the webOS TV SDK and add CLI tools to PATH."
}

if (-not (Test-Path "js\app.bundle.js")) {
    Write-Host "Building TypeScript bundle..."
    npm run build
}

Write-Host "Packaging webOS app..."
ares-package .

$ipk = Get-ChildItem -Filter "com.iptv.player_*.ipk" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($ipk) {
    Write-Host "Created: $($ipk.FullName)"
} else {
    Write-Warning "No .ipk found in current directory."
}

if ($Device) {
    & "$PSScriptRoot\install-tv.ps1" -Device $Device -Ipk $ipk.Name
}
