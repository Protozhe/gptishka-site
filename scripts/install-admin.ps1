param()

Write-Host "Installing root dependencies..."
npm install

Write-Host "Copy env examples if needed..."
if (-not (Test-Path "apps/admin-backend/.env")) {
  Copy-Item "apps/admin-backend/.env.example" "apps/admin-backend/.env"
}
if (-not (Test-Path "apps/admin-ui/.env")) {
  Copy-Item "apps/admin-ui/.env.example" "apps/admin-ui/.env"
}

Write-Host "Generate Prisma client..."
npm run prisma:generate --workspace @gptishka/admin-backend

Write-Host "Run Prisma migrations..."
npm run prisma:migrate --workspace @gptishka/admin-backend

Write-Host "Seed database..."
npm run seed --workspace @gptishka/admin-backend

Write-Host "Done. Use: npm run dev:admin:api and npm run dev:admin:ui"
