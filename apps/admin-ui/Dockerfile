FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/admin-ui/package*.json ./apps/admin-ui/
RUN npm install

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace @gptishka/admin-ui

FROM nginx:1.27-alpine
COPY apps/admin-ui/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin-ui/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
