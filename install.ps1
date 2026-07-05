param(
  [string]$Version = $env:TOKEN_COMPANION_VERSION,
  [string]$InstallDir,
  [switch]$DryRun,
  [switch]$PackageOnly,
  [switch]$Help
)

$ErrorActionPreference = "Stop"
$Repo = "pzarzycki/token-companion"
if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = "latest"
}

function Show-Usage {
  @"
Token Companion source installer

Usage:
  powershell -ExecutionPolicy Bypass -File .\install.ps1 [options]

Options:
  -Version <ref>       Git tag or branch to build. Defaults to latest release, then main.
  -DryRun              Print commands and install targets without building.
  -PackageOnly         Build packages but do not install or launch installers.
  -InstallDir <path>   Reserved for parity with macOS/Linux.
  -Help                Show this help.

Environment:
  TOKEN_COMPANION_VERSION      Same as -Version.
  TOKEN_COMPANION_BUILD_ROOT   Source/build cache root.
"@
}

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

function Resolve-Latest {
  try {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -UseBasicParsing
    if ($release.tag_name) {
      return [string]$release.tag_name
    }
  } catch {
    Write-Warning $_
  }

  return "main"
}

function Get-RefKind([string]$Ref) {
  if ($Ref -eq "main" -or $Ref -eq "master") {
    return "heads"
  }

  return "tags"
}

function Get-SafeRef([string]$Ref) {
  return ($Ref -replace "[^A-Za-z0-9._-]", "-")
}

function Get-BuildRoot {
  if ($env:TOKEN_COMPANION_BUILD_ROOT) {
    return $env:TOKEN_COMPANION_BUILD_ROOT
  }

  if ($env:LOCALAPPDATA) {
    return (Join-Path $env:LOCALAPPDATA "TokenCompanion\build")
  }

  return (Join-Path $env:TEMP "TokenCompanion\build")
}

function Get-Source([string]$Ref) {
  $kind = Get-RefKind $Ref
  $safeRef = Get-SafeRef $Ref
  $buildRoot = Get-BuildRoot
  $target = Join-Path $buildRoot "source-$safeRef"
  $archive = Join-Path $buildRoot "source-$safeRef.zip"
  $url = "https://github.com/$Repo/archive/refs/$kind/$Ref.zip"

  New-Item -ItemType Directory -Force $buildRoot | Out-Null
  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
  }

  Write-Host "Downloading source: $url"
  Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing
  Expand-Archive -LiteralPath $archive -DestinationPath $target -Force
  $source = Get-ChildItem -LiteralPath $target -Directory | Select-Object -First 1
  if (-not $source) {
    throw "Could not find extracted source directory under $target"
  }

  return $source.FullName
}

if ($Help) {
  Show-Usage
  exit 0
}

Require-Command "node"
Require-Command "npm"

$sourceDir = $null
if ($PSScriptRoot -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot "scripts\install.mjs"))) {
  $sourceDir = $PSScriptRoot
} else {
  if ($Version -eq "latest") {
    $Version = Resolve-Latest
  }
  $sourceDir = Get-Source $Version
}

$nodeArgs = @("scripts\install.mjs")
if ($DryRun) { $nodeArgs += "--dry-run" }
if ($PackageOnly) { $nodeArgs += "--package-only" }
if ($InstallDir) {
  $nodeArgs += "--install-dir"
  $nodeArgs += $InstallDir
}

Write-Host "Building Token Companion from $sourceDir"
Push-Location $sourceDir
try {
  & node @nodeArgs
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}
