# Backend Mostruário para Fly.io (região gru = São Paulo), co-localizado com o
# Neon em SP. Espelha o fluxo do Render: instala deps (com dev, p/ tsc/tsx),
# builda o backend e, ao subir, roda as migrations e inicia o servidor.
#
# Por que dev deps no runtime: as migrations rodam com `tsx migrations/run.ts`
# (o run.ts lê os .sql pelo __dirname na pasta-fonte). Manter a fonte + tsx no
# container é o caminho mais simples e idêntico ao que já funciona no Render.
FROM node:20-slim

WORKDIR /app
ENV NODE_ENV=production

# 1) Só os manifestos primeiro, para aproveitar o cache de camada do Docker.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json

# --include=dev: com NODE_ENV=production o npm omitiria devDependencies (tsc/tsx).
RUN npm ci --include=dev

# 2) Código e build do backend (gera dist/backend/src/server.js).
COPY . .
RUN npm run build -w backend

EXPOSE 3333

# Migra o Neon (DIRECT) e sobe o servidor — mesmo startCommand do render.yaml.
CMD ["sh", "-lc", "npm run migrate -w backend && npm run start -w backend"]
