$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path -LiteralPath '.env')) {
  Copy-Item -LiteralPath '.env.example' -Destination '.env'
  throw 'Created .env from template. Set your local PostgreSQL password, then rerun setup.'
}
& npm.cmd run db:setup -w '@taskboard/backend'
exit $LASTEXITCODE

