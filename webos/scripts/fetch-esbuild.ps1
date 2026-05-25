# Downloads esbuild.exe into tools/ when npm is not available.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$tools = Join-Path $root "tools"
$exe = Join-Path $tools "esbuild.exe"
if (Test-Path $exe) {
    Write-Host "esbuild.exe already present"
    exit 0
}
New-Item -ItemType Directory -Force -Path $tools | Out-Null
$tgz = Join-Path $env:TEMP "win32-x64-0.25.0.tgz"
Write-Host "Downloading @esbuild/win32-x64..."
Invoke-WebRequest -Uri "https://registry.npmjs.org/@esbuild/win32-x64/-/win32-x64-0.25.0.tgz" -OutFile $tgz -UseBasicParsing
$extract = Join-Path $env:TEMP "esbuild-pkg"
if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
New-Item -ItemType Directory -Force -Path $extract | Out-Null
tar -xzf $tgz -C $extract
Copy-Item (Join-Path $extract "package\esbuild.exe") $exe -Force
Write-Host "Installed $exe"
& $exe --version
