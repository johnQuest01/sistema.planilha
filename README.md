# Mostruário

Uma pessoa define a estrutura de uma planilha do zero; outra preenche pelo celular, sem ter conta.

Schema como dado + `jsonb` (a definição do campo é linha na tabela `campos`; o valor mora num `jsonb` em `registros`). Sem ORM, sem `ALTER TABLE` em runtime, sem EAV.

## Stack

- **Backend:** Node 20+, TypeScript strict, Fastify, PostgreSQL (Neon) via `postgres` (porsager), Zod
- **Frontend:** React 18 + Vite + React Router, CSS puro, `lucide-react`
- **Storage de imagem:** Cloudflare R2 (Fase 5)

## Estrutura

```
backend/    API Fastify + migrations SQL na mão
frontend/   React + Vite
shared/     contratos TypeScript (fonte única da verdade)
```

## Setup (Fase 1)

Pré-requisito: Node 20+.

1. Configure o banco:
   ```
   cp backend/.env.example backend/.env
   ```
   Preencha `DATABASE_URL` com a connection string do Neon
   (`postgresql://user:pass@host/db?sslmode=require`).

2. Instale as dependências (na raiz, workspaces):
   ```
   npm install
   ```

3. Rode as migrations:
   ```
   npm run migrate
   ```

4. Suba backend e frontend (dois terminais):
   ```
   npm run dev:backend
   npm run dev:frontend
   ```

5. Confira `http://localhost:3333/health` e a home do frontend em `http://localhost:5173`.

## Scripts (raiz)

| Script | O quê |
|---|---|
| `npm run migrate` | aplica migrations pendentes |
| `npm run dev:backend` | Fastify em watch |
| `npm run dev:frontend` | Vite dev server |
| `npm run typecheck` | `tsc --noEmit` nos dois lados |
| `npm run build` | build de produção dos dois |
