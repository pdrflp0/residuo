# Imagem única para reference-service e api (o comando muda no compose).
# A API também serve a interface compilada (WEB_DIST).
FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/engine/package.json packages/engine/
COPY apps/reference-service/package.json apps/reference-service/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY packages ./packages
COPY apps ./apps
RUN npm run build -w @residuo/web
ENV NODE_ENV=production
