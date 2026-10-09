$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
Write-Host "======================================================"
Write-Host " Building Statikor (Nuitka C++ Sidecar + Tauri .exe)  "
Write-Host "======================================================"

Set-Location $RootDir

# 1. Determine Rust Host Target Triple
$RustcOutput = & rustc -vV
$TargetTriple = ($RustcOutput | Select-String "^host:\s+(.+)$").Matches.Groups[1].Value.Trim()
Write-Host "Host Target Triple: $TargetTriple"

# 2. Determine Python interpreter for sidecar
$PythonBin = $null
$Candidates = @(
    (Join-Path $RootDir "sidecar\.venv\Scripts\python.exe"),
    (Join-Path $RootDir "server\.venv\Scripts\python.exe")
)
foreach ($c in $Candidates) {
    if (Test-Path $c) {
        $PythonBin = $c
        break
    }
}
if (-not $PythonBin) {
    $PythonBin = "python"
}
Write-Host "Using Python: $PythonBin"

# 3. Compile Sidecar via Nuitka
Write-Host "Compiling Python sidecar to native C++ binary with Nuitka..."
Set-Location (Join-Path $RootDir "sidecar")

& $PythonBin -m nuitka `
    --standalone `
    --onefile `
    --assume-yes-for-downloads `
    --remove-output `
    --output-dir=dist `
    --output-filename=statikor-sidecar.exe `
    src/sidecar/sidecar.py

# 4. Copy binary to Tauri binaries directory
$BinariesDir = Join-Path $RootDir "client\src-tauri\binaries"
New-Item -ItemType Directory -Force -Path $BinariesDir | Out-Null

$CompiledBin = Join-Path $RootDir "sidecar\dist\statikor-sidecar.exe"
$TargetBin = Join-Path $BinariesDir "statikor-sidecar-$TargetTriple.exe"
$PlainBin = Join-Path $BinariesDir "statikor-sidecar.exe"

Copy-Item -Force $CompiledBin $TargetBin
Copy-Item -Force $CompiledBin $PlainBin
Write-Host "Sidecar native binary ready: $TargetBin"

# 5. Build Tauri Windows Installer (.exe)
Write-Host "Building Tauri Desktop Installer (.exe)..."
Set-Location (Join-Path $RootDir "client")
npm run tauri build

Write-Host "======================================================"
Write-Host " Statikor Windows Build Complete!                     "
Write-Host " Installer: client\src-tauri\target\release\bundle\nsis\Statikor_0.1.0_x64-setup.exe"
Write-Host "======================================================"

