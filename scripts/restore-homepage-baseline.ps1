param(
  [ValidateSet("show", "restore", "verify")]
  [string]$Action = "show",

  [string]$BaselineDir = (Join-Path $PSScriptRoot "..\\stable-baselines\\homepage-20260525")
)

$ErrorActionPreference = "Stop"

function Resolve-StrictPath {
  param([string]$PathValue)
  if (-not (Test-Path -LiteralPath $PathValue)) {
    throw "Path not found: $PathValue"
  }
  return (Resolve-Path -LiteralPath $PathValue).Path
}

function RelToOsPath {
  param([string]$Rel)
  return ($Rel -replace "/", [IO.Path]::DirectorySeparatorChar)
}

$repoRoot = Resolve-StrictPath (Join-Path $PSScriptRoot "..")
$baselineRoot = Resolve-StrictPath $BaselineDir
$manifestPath = Join-Path $baselineRoot "SHA256SUMS.txt"

if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "SHA256SUMS.txt not found in baseline: $baselineRoot"
}

$manifest = @()
Get-Content -LiteralPath $manifestPath | ForEach-Object {
  $line = $_.Trim()
  if (-not $line) { return }
  if ($line -match "^([0-9a-fA-F]{64})\s+(.+)$") {
    $manifest += [PSCustomObject]@{
      Hash = $matches[1].ToLowerInvariant()
      Rel = $matches[2]
    }
  }
}

if ($manifest.Count -eq 0) {
  throw "Empty or invalid SHA256SUMS.txt: $manifestPath"
}

if ($Action -eq "show") {
  Write-Output "Baseline: $baselineRoot"
  Write-Output "RepoRoot: $repoRoot"
  Write-Output "Files:"
  $manifest | ForEach-Object { Write-Output " - $($_.Rel)" }
  exit 0
}

if ($Action -eq "restore") {
  foreach ($item in $manifest) {
    $relOs = RelToOsPath $item.Rel
    $src = Join-Path $baselineRoot $relOs
    $dst = Join-Path $repoRoot $relOs

    if (-not (Test-Path -LiteralPath $src)) {
      throw "Missing baseline file: $src"
    }

    $dstDir = Split-Path -Parent $dst
    New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
    Copy-Item -LiteralPath $src -Destination $dst -Force
    Write-Output "restored $($item.Rel)"
  }

  Write-Output "restore_done"
  exit 0
}

$mismatches = @()
foreach ($item in $manifest) {
  $relOs = RelToOsPath $item.Rel
  $dst = Join-Path $repoRoot $relOs

  if (-not (Test-Path -LiteralPath $dst)) {
    $mismatches += "missing  $($item.Rel)"
    continue
  }

  $current = (Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($current -ne $item.Hash) {
    $mismatches += "changed  $($item.Rel)"
  }
}

if ($mismatches.Count -eq 0) {
  Write-Output "verify_ok"
  exit 0
}

$mismatches | ForEach-Object { Write-Output $_ }
exit 1
