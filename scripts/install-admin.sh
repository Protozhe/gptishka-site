#!/usr/bin/env bash
set -euo pipefail

npm install

[ -f apps/admin-backend/.env ] || cp apps/admin-backend/.env.example apps/admin-backend/.env
[ -f apps/admin-ui/.env ] || cp apps/admin-ui/.env.example apps/admin-ui/.env

npm run prisma:generate --workspace @gptishka/admin-backend
npm run prisma:migrate --workspace @gptishka/admin-backend
npm run seed --workspace @gptishka/admin-backend

echo "Done. Start services: npm run dev:admin:api && npm run dev:admin:ui"
