# One-command environment setup for a fresh clone of Canary.
# Run from the repo root: .\scripts\setup.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "== Canary setup ==" -ForegroundColor Cyan

# 1. Node version check (informational — doesn't block, since nvm-windows/fnm handle switching differently)
$expectedNode = (Get-Content ".nvmrc").Trim()
$actualNode = (node --version) -replace '^v', '' -replace '\..*$', ''
if ($actualNode -ne $expectedNode) {
    Write-Host "  Node $expectedNode expected (.nvmrc), found v$(node --version 2>&1 | ForEach-Object { $_ -replace '^v','' }). Continuing anyway — install $expectedNode if something breaks." -ForegroundColor Yellow
} else {
    Write-Host "  Node version OK ($(node --version))" -ForegroundColor Green
}

# 2. npm install at root (the only place this should ever run — see AGENTS.md)
Write-Host "`n-- Installing JS workspaces (apps/web, apps/api, packages/*) --" -ForegroundColor Cyan
npm install
Write-Host "  Done. Husky's pre-commit hook is now installed (via the 'prepare' script)." -ForegroundColor Green

# 3. .env.example -> .env copies (only if the real .env doesn't already exist — never overwrite)
Write-Host "`n-- Copying env templates --" -ForegroundColor Cyan
$envPairs = @(
    @{ Example = "apps\api\.env.example"; Real = "apps\api\.env" },
    @{ Example = "apps\intelligence\.env.example"; Real = "apps\intelligence\.env" }
)
foreach ($pair in $envPairs) {
    if (Test-Path $pair.Example) {
        if (-not (Test-Path $pair.Real)) {
            Copy-Item $pair.Example $pair.Real
            Write-Host "  Created $($pair.Real)" -ForegroundColor Green
        } else {
            Write-Host "  $($pair.Real) already exists — left untouched" -ForegroundColor Yellow
        }
    }
}

# 4. Ask whether this machine needs the Python side (Teammate 2 doesn't — see tooling-primer.md)
Write-Host "`n-- Python environment (apps/intelligence) --" -ForegroundColor Cyan
$needsPython = Read-Host "Do you need the Python/demo-data side? (Teammate 3 or Rudra: y, Teammate 2: n) [y/N]"
if ($needsPython -eq "y" -or $needsPython -eq "Y") {
    $pythonDir = Join-Path $repoRoot "apps\intelligence"
    $venvPath = Join-Path $pythonDir "venv"
    if (-not (Test-Path $venvPath)) {
        Write-Host "  Creating venv..." -ForegroundColor Cyan
        python -m venv $venvPath
    } else {
        Write-Host "  venv already exists — reusing it" -ForegroundColor Yellow
    }
    $venvPython = Join-Path $venvPath "Scripts\python.exe"
    & $venvPython -m pip install -r (Join-Path $pythonDir "requirements.txt")
    Write-Host "  Python dependencies installed." -ForegroundColor Green
} else {
    Write-Host "  Skipped — you don't need this for landing/report work." -ForegroundColor Yellow
}

Write-Host "`n== Setup complete ==" -ForegroundColor Cyan
Write-Host "Next: read .ai/onboarding/team-brief.md if you haven't, then make your branch:"
Write-Host "  git checkout -b yourname/what-it-is" -ForegroundColor Gray
