# Installs and launches the packaged .ipk on a configured webOS TV device.
param(
    [string]$Device = "TV",
    [string]$Ipk = ""
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

foreach ($cmd in @("ares-install", "ares-launch")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Error "$cmd not found. Install webOS TV SDK CLI tools."
    }
}

if (-not $Ipk) {
    $latest = Get-ChildItem -Filter "com.iptv.player_*.ipk" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $latest) {
        Write-Host "No .ipk found; running package script first..."
        & "$PSScriptRoot\package-ipk.ps1"
        $latest = Get-ChildItem -Filter "com.iptv.player_*.ipk" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    }
    $Ipk = $latest.Name
}

Write-Host "Installing $Ipk on device '$Device'..."
ares-install --device $Device $Ipk

Write-Host "Launching com.iptv.player..."
ares-launch --device $Device com.iptv.player

Write-Host "Done. Use 'ares-inspect --device $Device --app com.iptv.player --open' for DevTools."
