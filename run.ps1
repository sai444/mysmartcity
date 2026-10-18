# Starts the MyNagari API (http://127.0.0.1:8000) and web app (http://localhost:5173) for local development.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw "python not found on PATH" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "npm not found on PATH" }

python -c "import fastapi, uvicorn, pydantic_settings, jwt, argon2, multipart" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing backend dependencies..."
    python -m pip install -r (Join-Path $backend "requirements.txt")
}

if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
    Write-Host "Installing frontend dependencies..."
    Push-Location $frontend
    npm install
    Pop-Location
}

Write-Host "Starting API on http://127.0.0.1:8000"
Start-Process powershell -WorkingDirectory $backend -ArgumentList "-NoExit", "-Command", "python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

Write-Host "Starting web app on http://127.0.0.1:5173"
Start-Process powershell -WorkingDirectory $frontend -ArgumentList "-NoExit", "-Command", "npm run dev"

Start-Sleep -Seconds 4
Start-Process "http://127.0.0.1:5173"
