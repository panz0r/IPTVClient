# Build, package, install, and launch on the webOS TV emulator.
$ErrorActionPreference = "Stop"
$env:LG_WEBOS_TV_SDK_HOME = "F:\webOS_TV_SDK"
$env:Path = "F:\webOS_TV_SDK\CLI\bin;C:\Program Files\Oracle\VirtualBox;" + $env:Path

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$node = "c:\Program Files\cursor\resources\app\resources\helpers\node.exe"
if (-not (Test-Path $node)) {
    $node = "node"
}

Write-Host "Building..."
& $node scripts\build.mjs

Write-Host "Packaging..."
ares-package .

$ipk = Get-ChildItem -Filter "com.iptv.player_*.ipk" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $ipk) {
    throw "No .ipk produced"
}

Write-Host "Waiting for emulator..."
$ready = $false
for ($i = 1; $i -le 30; $i++) {
    ares-device-info -d emulator 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 5
}
if (-not $ready) {
    Write-Error "Emulator not reachable. Start LG_webOS_TV_Emulator from F:\webOS_TV_SDK\Emulator\v6.0.0"
}

Write-Host "Installing $($ipk.Name)..."
ares-install -d emulator $ipk.Name

Write-Host "Launching com.iptv.player..."
ares-launch -d emulator com.iptv.player

Write-Host "Done. Running apps:"
ares-launch -d emulator -r
