FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/admin-backend/package*.json ./apps/admin-backend/
RUN npm install

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate --schema apps/admin-backend/prisma/schema.prisma
RUN npm run build --workspace @gptishka/admin-backend

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/admin-backend/dist ./dist
COPY --from=build /app/apps/admin-backend/prisma ./prisma
COPY --from=build /app/apps/admin-backend/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
CMD ["node", "dist/main.js"]
