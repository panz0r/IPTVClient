# Ensures webOS TV CLI >= 1.12.4 for deploy (required by modern Developer Mode).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$repoRoot = Split-Path $root -Parent
$cliBin = Join-Path $repoRoot "tools\webos-cli"
$aresPackage = Join-Path $cliBin "ares-package.cmd"

function Test-CliOk([string]$binDir) {
  $ares = Join-Path $binDir "ares-package.cmd"
  if (-not (Test-Path $ares)) { return $false }
  $pkg = Join-Path $binDir "node_modules\@webos-tools\cli\package.json"
  if (Test-Path $pkg) {
    $json = Get-Content $pkg -Raw | ConvertFrom-Json
    if ($json.version -match '^3\.') { return $true }
  }
  $out = cmd /c "`"$ares`" --version 2>&1"
  if ($out -match '1\.1[2-9]\.|1\.[2-9]\d') { return $true }
  return $false
}

if ((Test-Path $aresPackage) -and (Test-CliOk $cliBin)) {
  Write-Host "webOS CLI OK at $cliBin"
  exit 0
}

Write-Host "Installing @webos-tools/cli (TV profile) to tools\webos-cli ..."

$nodeDir = Join-Path $repoRoot "tools\node"
$nodeZip = Join-Path $env:TEMP "node-win-x64.zip"
$nodeUrl = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip"

if (-not (Test-Path (Join-Path $nodeDir "node.exe"))) {
  Write-Host "Downloading Node.js ..."
  Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip -UseBasicParsing
  if (Test-Path $nodeDir) { Remove-Item $nodeDir -Recurse -Force }
  Expand-Archive -Path $nodeZip -DestinationPath (Join-Path $repoRoot "tools") -Force
  Rename-Item (Join-Path $repoRoot "tools\node-v20.18.0-win-x64") $nodeDir
}

$node = Join-Path $nodeDir "node.exe"
$npm = Join-Path $nodeDir "npm.cmd"
$prefix = Join-Path $repoRoot "tools\webos-cli"

New-Item -ItemType Directory -Force -Path $prefix | Out-Null
& $npm config set prefix $prefix
& $npm install -g @webos-tools/cli

if (-not (Test-CliOk $prefix)) {
  throw "CLI install failed or version too old."
}
Write-Host "Installed webOS CLI at $prefix"
