# Documentação completa do Mostruário (sistema-corte)

> Manual **de cabo a rabo** para humanos e para a próxima IA: banco, migrations,
> backend, frontend, shared, fotos, estilização, deploy (Vercel + Fly.io), auth
> multi-conta, realtime, importação e regras de negócio.
>
> **Regra de ouro: nunca apagar dados sem soft-delete.** Migrations são aditivas.
> Apagar registro/planilha = lixeira; “apagar definitivo” (só admin) remove do DB e do R2.

**URLs de produção (referência):**

| Peça | URL |
|------|-----|
| Frontend (Vercel) | `https://sistema-planilha-backend.vercel.app` |
| Backend (Fly.io) | `https://mostruario-api.fly.dev` |
| WebSocket | `wss://mostruario-api.fly.dev` |
| R2 público | `https://pub-856c1e1b6dc645308495de9e44b391e0.r2.dev` |
| Neon | Postgres `sa-east-1` (SP), app usa URL **pooled** (`-pooler`) |

**Estado recente (ago/2026, commit `de91f4c` e ajustes locais de botão):** home compacta no mobile; visor de foto alta sem corte sob o rodapé; GET registros numa só transação; cache curto de sessão; prefetch mais leve. Botões da home e da barra de registros no mesmo tamanho (36px / 13px).

---

## Sumário

1. [O que é o app e qual é o MOTOR](#1-o-que-é-o-app-e-qual-é-o-motor)
2. [Arquitetura e monorepo](#2-arquitetura-e-monorepo)
3. [Stacks e versões](#3-stacks-e-versões)
4. [Como rodar, buildar e deployar](#4-como-rodar-buildar-e-deployar)
5. [Variáveis de ambiente](#5-variáveis-de-ambiente)
6. [Shared (`shared/tipos.ts`)](#6-shared-sharedtiposts)
7. [Banco de dados (Neon Postgres)](#7-banco-de-dados-neon-postgres)
8. [Migrations (001 → 023)](#8-migrations-001--023)
9. [Backend (Fastify) — mapa e boot](#9-backend-fastify--mapa-e-boot)
10. [API completa (rotas)](#10-api-completa-rotas)
11. [Auth, sessão, multi-conta](#11-auth-sessão-multi-conta)
12. [Realtime / WebSocket](#12-realtime--websocket)
13. [Fotos e Cloudflare R2](#13-fotos-e-cloudflare-r2)
14. [Importação, conversão e criação automática](#14-importação-conversão-e-criação-automática)
15. [Frontend — rotas, pastas, telas](#15-frontend--rotas-pastas-telas)
16. [Design system e estilização](#16-design-system-e-estilização)
17. [Modelo de UI: blocos, seções, corpo próprio](#17-modelo-de-ui-blocos-seções-corpo-próprio)
18. [Integrações (planilhas unidas)](#18-integrações-planilhas-unidas)
19. [Cache, prefetch, PWA](#19-cache-prefetch-pwa)
20. [Lixeira, arquivar, senha, trava](#20-lixeira-arquivar-senha-trava)
21. [Backup / export / import ZIP](#21-backup--export--import-zip)
22. [Convenções, armadilhas e checklist para a próxima IA](#22-convenções-armadilhas-e-checklist-para-a-próxima-ia)

---

## 1. O que é o app e qual é o MOTOR

### O que é

PWA de **planilhas visuais / mostruário** para catálogo (costura/oficina): cada
**planilha** (`coleção`) tem **registros** (cartões). Cada registro é feito de
**blocos** (`campos`) — texto, número, seleção, data, imagem, seção repetível.
Casos típicos: MODELAGEM, Caderno do Hugo, Oficina — com **referência + fotos + cor**.

### O MOTOR (núcleo do sistema)

O motor **não** é um ORM nem um spreadsheet clássico. É o padrão **schema-as-data**:

1. **Blocos = linhas** na tabela `campos` (nome, tipo, ordem, `config` jsonb).
2. **Valores = jsonb** em `registros.valores`, chaveada por `campo.id` (UUID).
3. **Corpo próprio opcional**: `registros.campos` (jsonb) — estrutura só daquele registro.
4. **Imagens fora do DB**: keys no jsonb; bytes no **Cloudflare R2**.
5. **Integração = visão**: merge no frontend pela **referência** (código inicial), sem fundir tabelas.

Em uma frase: **Postgres (Neon) + jsonb de valores + blocos como dados + R2 para fotos + Fastify + React**.

Fluxo mental:

```
Conta (tenant)
 └─ Coleções (planilhas)
     ├─ Campos (blocos do template compartilhado)
     └─ Registros
         ├─ valores { [campoId]: ... }
         ├─ campos? (corpo próprio)
         └─ ordem (posição na lista)
 └─ Integrações (lista ordenada de colecaoIds — só config)
 └─ Usuários / conta_membros / sessões
```

---

## 2. Arquitetura e monorepo

Nome npm da raiz: `sistema-corte`. Workspaces: `backend`, `frontend`.
A pasta `shared/` **não** é workspace npm — ambos importam por caminho relativo
(`../../shared` ou `../../../shared`).

```
sistema.planilha-main/
├─ package.json                 # workspaces + scripts dev/migrate/build
├─ backend/
│  ├─ package.json
│  ├─ migrations/               # 001..023 .sql + run.ts
│  ├─ scripts/                  # backup-r2.mjs etc.
│  └─ src/
│     ├─ server.ts              # boot Fastify
│     ├─ config.ts              # env
│     ├─ db/                    # client Neon, comConta (RLS), schemaPronto
│     ├─ auth/                  # cookie, sessão, argon2, workspace, exigeDono
│     ├─ rotas/                 # HTTP handlers
│     ├─ repositorios/          # SQL por domínio
│     ├─ validacao/             # Zod
│     ├─ r2/                    # presign / keys / delete
│     ├─ ws/                    # presencaHub + rotasWs
│     ├─ publico/               # link HMAC legado
│     └─ scripts/               # limparR2
├─ frontend/
│  ├─ package.json
│  ├─ vite.config.ts            # PWA + proxy /api → :3333
│  ├─ vercel.json               # rewrites (espelho)
│  └─ src/                      # ver §15
├─ shared/
│  └─ tipos.ts                  # ÚNICA fonte de tipos de domínio
├─ Dockerfile                   # Node 20 → migrate + start (Fly)
├─ fly.toml                     # mostruario-api @ gru
├─ vercel.json                  # build frontend + proxy /api → Fly
├─ r2-cors.json                 # CORS do bucket
├─ render.yaml                  # legado (não é o deploy ativo)
├─ .github/workflows/
│  ├─ deploy-fly.yml
│  └─ backup-r2.yml
├─ DOCUMENTACAO.md              # este arquivo
├─ DEPLOY.md / atualizacao*.MD / informacoes.MD
└─ docs/                        # docs auxiliares (se houver)
```

### Diagrama de produção

```
Navegador (PWA na Vercel)
  │  fetch('/api/...')  credentials same-origin
  │  WebSocket (wsBase de /api/config)
  ▼
Vercel (SPA + rewrite /api → Fly)
  ▼
Fly.io mostruario-api (Fastify :3333, 1 máquina)
  ├─ Neon Postgres (RLS por conta)
  └─ Cloudflare R2 (presigned PUT; leitura pública)
```

O frontend **nunca** embute `VITE_API_URL`. Em prod, Vercel faz proxy; em dev, Vite proxy.

---

## 3. Stacks e versões

### Raiz

- Node `>=20`
- `concurrently` para `npm run dev` (api + web)

### Backend (`backend/package.json`)

| Pacote | Papel |
|--------|--------|
| `fastify` ^5 | HTTP |
| `@fastify/cookie` | Cookie assinado `sessao` |
| `@fastify/cors` | CORS com credentials |
| `@fastify/helmet` | Headers |
| `@fastify/rate-limit` | 300/min global; auth mais apertado |
| `@fastify/websocket` | Presença |
| `postgres` (postgres.js) | Driver Neon |
| `zod` | Validação de body/query |
| `@node-rs/argon2` | Hash de senha |
| `@aws-sdk/client-s3` + `s3-request-presigner` | R2 |
| `tsx` | Dev + migrate |
| `typescript` | Build |

Scripts típicos: `dev` (`tsx watch src/server.ts`), `build` (`tsc`), `start` (`node dist/...`), `migrate` (`tsx migrations/run.ts`).

### Frontend (`frontend/package.json`)

| Pacote | Papel |
|--------|--------|
| `react` / `react-dom` ^18.3 | UI |
| `vite` ^5.4 | Bundler |
| `react-router-dom` ^6.28 | Rotas |
| `vite-plugin-pwa` | Instalável / SW |
| `@tanstack/react-virtual` | Listas longas |
| `lucide-react` | Ícones |
| `jszip` | Backup/import ZIP |
| `typescript` ^5.7 | Tipos |

Scripts: `dev`, `build` (`tsc -b && vite build`), `preview`, `typecheck`.

### Infra

- **DB**: Neon PostgreSQL + RLS
- **Storage**: Cloudflare R2 bucket `mostruario-midia`
- **API host**: Fly.io `mostruario-api`, região `gru`, VM `shared-cpu-1x` 512MB
- **Front host**: Vercel

---

## 4. Como rodar, buildar e deployar

### Dev local

```bash
npm install
# backend/.env com DATABASE_URL (+ R2_* para upload)
npm run migrate
npm run dev          # API :3333 + Vite :5173
```

Vite proxy (`vite.config.ts`): `/api`, `/health` → `http://localhost:3333`; `/ws` → WS.

### Build

```bash
npm run typecheck
npm run build
```

### Deploy backend (Fly)

- `Dockerfile`: Node 20, `npm ci`, build backend, CMD = migrate + start.
- `fly.toml`: porta 3333, health `GET /health`, **1 máquina sempre ligada**
  (`min_machines_running = 1`, `auto_stop/start = false`) — presença WS é **em memória**.
- CI: `.github/workflows/deploy-fly.yml` no push em `main` quando mudam
  `backend/**`, `shared/**`, `Dockerfile`, `fly.toml` (ou `workflow_dispatch`).
  Secret: `FLY_API_TOKEN`.
- Manual: `flyctl deploy --remote-only`.
- Boot ainda chama `garantirSchemaPronto()` — se faltar schema crítico, **não sobe**.

### Deploy frontend (Vercel)

- Push em `main` → build `npm run build -w frontend`, output `frontend/dist`.
- `vercel.json` (raiz e espelho em `frontend/`):

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://mostruario-api.fly.dev/api/:path*" },
    { "source": "/health", "destination": "https://mostruario-api.fly.dev/health" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**Nota:** o rewrite da Vercel **não** proxya `/ws`. O cliente usa `wsBase` de
`GET /api/config` → `wss://mostruario-api.fly.dev` e conecta **direto** no Fly.

### Backup R2

- `.github/workflows/backup-r2.yml` — cron 06:00 UTC + manual.
- Script `backend/scripts/backup-r2.mjs` — cópia só-adição para bucket de backup.
- Envs: `R2_BACKUP_BUCKET`, `R2_SRC_*`, `R2_DST_*`.

### Legado

- `render.yaml` — blueprint Render (não é o caminho ativo).

---

## 5. Variáveis de ambiente

### Backend (obrigatórias / importantes)

| Variável | Obrigatória | Uso |
|----------|-------------|-----|
| `DATABASE_URL` | sim | Neon **pooled** (app) |
| `DATABASE_URL_DIRECT` | migrations | Neon **direct** (sem PgBouncer); fallback = `DATABASE_URL` |
| `COOKIE_SECRET` | prod: sim | Assina cookie `sessao` |
| `PORT` | não (3333) | Listen |
| `NODE_ENV` | prod | Endurece secrets |
| `CORS_ORIGIN` | não | URL do front (Vercel) |
| `R2_ACCOUNT_ID` | upload | Conta CF |
| `R2_ACCESS_KEY_ID` | upload | Key |
| `R2_SECRET_ACCESS_KEY` | upload | Secret |
| `R2_BUCKET` | upload | `mostruario-midia` |
| `R2_PUBLIC_BASE` | upload | Base pública das imagens |
| `WS_PUBLIC_BASE` | não | Exposto em `/api/config` |
| `LINK_PUBLICO_DIAS` | não (30) | Validade link público |
| `LINK_PUBLICO_SEGREDO` | não | HMAC legado; default = `COOKIE_SECRET` |
| `WORKSPACE_OWNER_EMAIL` | não | Quem pode **arquivar** (default Bruno) |
| `PLANILHA_ACESSO_LIVRE_EMAILS` | não | Whitelist senha de planilha |

Não-secretas no `fly.toml [env]`; secretas via `fly secrets set`.

### Frontend

- **Sem `VITE_*` de API.** Paths relativos `/api`.
- Runtime: `GET /api/config` → `{ r2PublicBase, wsBase }`.

---

## 6. Shared (`shared/tipos.ts`)

Única fonte de tipos de domínio. Backend e frontend importam daqui.

### Tipos de bloco

```ts
TIPOS_CAMPO = texto | paragrafo | numero | imagem | selecao | data | datahora | booleano | secao
TIPOS_SUBCAMPO = texto | numero | selecao | data | datahora | booleano | imagem  // sem seção aninhada
```

### `ConfigCampo`

| Campo | Uso |
|-------|-----|
| `opcoes?` | seleção |
| `sufixo?` | número (R$, kg…) |
| `obrigatorio?` | validação |
| `maxFotos?` | imagem, 1..30 (default 1) |
| `autoAgora?` | data/datahora pré-preenchida |
| `subcampos?` | seção |
| `titulo?` | cabeçalho visual acima do bloco |
| `ehTitulo?` | bloco é fonte do título do registro |

### Entidades

| Tipo | Essência |
|------|----------|
| `Campo` | id, colecaoId, nome, tipo, ordem, config |
| `Registro` | id, colecaoId, valores, campos?, criadoPor/Id, **ordem**, timestamps |
| `Colecao` | id, nome, criadoPor, campos[], **protegida**, **bloqueada**, **arquivada** |
| `Integracao` | id, nome, colecaoIds[], ativo, arquivada, timestamps |
| `ItemLixeira` | snapshot soft-delete + fotosReferencia |
| `Usuario` | papel dono\|membro, contaId/Home/Nome, pedido?, podeGerirSenhas? |
| `UsuarioResumo` | painel admin (origem nativo\|convidado) |
| `ContaAcessivel` | seletor multi-conta |
| `ValorJson` | JSON serializável (postgres.js) |

---

## 7. Banco de dados (Neon Postgres)

### Conexão (`backend/src/db/`)

- Driver **postgres.js**, `ssl: 'require'`, pool `max: 10`.
- App: `DATABASE_URL` (pooled).
- Migrations: `DATABASE_URL_DIRECT ?? DATABASE_URL`.
- Isolamento: `comConta(contaId)` → `set_config('app.conta_id', …, true)` + **FORCE RLS**.
- Controle: tabela `_migrations (nome PK, aplicada_em)`.

### Tabelas (estado atual após 023)

#### `contas` (tenant / workspace)

| Coluna | Notas |
|--------|--------|
| `id` uuid PK | |
| `email` unique | legado do dono original |
| `senha_hash` | legado; auth real em `usuarios` |
| `criado_em` | |
| `codigo_convite_hash` | código legado do workspace |
| `edicao_liberada` boolean default false | trava de edição global |
| `nome` | nome amigável (multi-tenant) |

Sem RLS — o app media o acesso.

#### `usuarios`

| Coluna | Notas |
|--------|--------|
| `id` uuid PK | |
| `conta_id` → contas CASCADE | **home** do usuário |
| `nome`, `email` unique, `senha_hash` | Argon2 |
| `papel` | `dono` \| `membro` (na home) |
| `criado_em`, `visto_em` | presença |

#### `sessoes`

| Coluna | Notas |
|--------|--------|
| `id` text PK | 32 bytes base64url — valor do cookie |
| `conta_id` | conta **ativa** da sessão |
| `usuario_id` → usuarios | |
| `criado_em`, `expira_em`, `revogado_em` | |

Fora do RLS (lookup pelo id do cookie).

#### `colecoes`

| Coluna | Notas |
|--------|--------|
| `id`, `conta_id`, `nome` (1–80) | |
| `criado_por` → usuarios SET NULL | quem pode apagar (além do dono) |
| `senha_hash` | planilha protegida |
| `arquivada` boolean | some p/ todos menos workspace owner |
| timestamps | |

RLS por `conta_id`.

#### `campos`

| Coluna | Notas |
|--------|--------|
| `id`, `colecao_id` CASCADE | |
| `nome` (1–60), `tipo`, `ordem`, `config` jsonb | |
| tipos CHECK | inclui `datahora`, `secao` (mig 005) |

#### `registros`

| Coluna | Notas |
|--------|--------|
| `id`, `colecao_id` | |
| `valores` jsonb | `{ "<campo_uuid>": valor }` |
| `campos` jsonb | corpo próprio (mig 014); null = herda coleção |
| `ordem` double precision | maior = topo (mig 018) |
| `criado_por` text, `criado_por_id` → usuarios SET NULL | |
| timestamps | |
| índices | GIN em `valores`; `(colecao_id, ordem DESC)` |

#### `integracoes`

| Coluna | Notas |
|--------|--------|
| `conta_id`, `nome` | |
| `colecao_ids` jsonb | array **ordenado** de UUIDs (≥2) |
| `ativo`, `arquivada` | |
| `criado_por` | |

Só configuração — **não altera** registros.

#### `compartilhamentos`

| Coluna | Notas |
|--------|--------|
| `codigo` PK | link curto público |
| `registro_id`, `conta_id` | |
| `blocos` jsonb | quais blocos mostrar |
| `partes` jsonb, `titulo` | multi-registro (mig 019) |
| `expira_em`, `revogado_em`, `criado_por` | |
| policy | SELECT público; escrita só da conta |

#### `convites_conta` + `conta_membros`

Tokens de convite multi-conta (`MOST-XXXX-XXXX` no UX):

- `convites_conta`: token, conta_id, rotulo, usos/max_usos, expira, revogado
- `conta_membros`: PK (conta_id, usuario_id), status `pendente|ativo|revogado`,
  papel `membro|dono`, token_origem, timestamps

#### Outras

| Tabela | Papel |
|--------|--------|
| `convites` | legado por coleção (preencher/ler) |
| `colecao_acessos` | PK (colecao_id, usuario_id) — desbloqueio de senha |
| `lixeira_registros` / `lixeira_colecoes` | soft-delete + snapshots + `fotos_referencia` |
| `lixo_r2` | keys órfãs para GC |
| `entradas` | log “X entrou” |

---

## 8. Migrations (001 → 023)

Runner: `backend/migrations/run.ts` — aplica arquivos `.sql` em ordem lexicográfica,
registra em `_migrations`. Idempotente.

| # | Arquivo | O que faz |
|---|---------|-----------|
| 001 | `001_init.sql` | `pgcrypto`; `contas`, `colecoes`, `campos`, `registros`, `convites` |
| 002 | `002_rls.sql` | ENABLE/FORCE RLS + policy `conta_isola` |
| 003 | `003_sessoes.sql` | `sessoes` |
| 004 | `004_lixo_r2.sql` | `lixo_r2` |
| 005 | `005_tipos_datahora_secao.sql` | tipos `datahora`, `secao` |
| 006 | `006_usuarios_workspace.sql` | `usuarios`; sessão→usuario; convite workspace; `criado_por` |
| 007 | `007_presenca.sql` | `visto_em`; `entradas` |
| 008 | `008_lixeira_registros.sql` | soft-delete registros |
| 009 | `009_lixeira_fotos_referencia.sql` | `fotos_referencia` jsonb |
| 010 | `010_lixeira_colecoes.sql` | soft-delete coleções |
| 011 | `011_senha_oficina.sql` | `senha_hash` + `colecao_acessos` |
| 012 | `012_idx_registros_paginacao.sql` | índice paginação |
| 013 | `013_conta_edicao_trava.sql` | `edicao_liberada` |
| 014 | `014_registro_corpo_proprio.sql` | `registros.campos` jsonb |
| 015a | `015_integracoes.sql` | `integracoes` |
| 015b | `015_compartilhamentos.sql` | links públicos curtos |
| 016 | `016_colecao_arquivada.sql` | `colecoes.arquivada` |
| 017 | `017_integracao_arquivada.sql` | `integracoes.arquivada` |
| 018 | `018_registros_ordem.sql` | `ordem` double + índice |
| 019 | `019_compartilhamentos_partes.sql` | `partes`, `titulo` |
| 020 | `020_contas_multi_tenant.sql` | `contas.nome`; `convites_conta` |
| 021 | `021_usuarios_delete_set_null.sql` | FKs `criado_por` → ON DELETE SET NULL |
| 022 | `022_conta_membros.sql` | membros pendente/ativo/revogado |
| 023 | `023_conta_membros_papel.sql` | `conta_membros.papel` |

**Ao criar migration nova:** número seguinte (`024_...sql`), só ADDITIVE, nunca DROP de dados; testar com `npm run migrate`; o boot do Fly aplica sozinho.

---

## 9. Backend (Fastify) — mapa e boot

### Boot (`server.ts`)

1. Plugins: websocket, helmet, cors (`credentials: true`), cookie assinado, rate-limit 300/min.
2. Error handler: Zod → 400.
3. Registra todas as rotas + `/health` + `/ws/presenca`.
4. `garantirSchemaPronto()` — aborta se schema crítico faltar.
5. `listen(PORT, '0.0.0.0')`.

### Pastas `backend/src/`

| Pasta | Responsabilidade |
|-------|------------------|
| `auth/` | cookies, sessoes, exigeDono, senha argon2, acessoColecao, workspace |
| `db/` | client, comConta, schemaPronto |
| `rotas/` | handlers HTTP |
| `repositorios/` | SQL |
| `validacao/` | Zod (campo, valores, colecao, upload…) |
| `r2/` | keys, presign PUT, delete |
| `ws/` | hub em memória + rota WS |
| `publico/` | token HMAC legado |
| `config.ts` | env tipado |
| `erros.ts` | erros de domínio |

### Isolamento de tenant

Quase toda rota autenticada:

```ts
await comConta(contaIdDaSessao, async (sql) => { ... });
```

RLS garante que queries só veem linhas da conta ativa.

**Path quente de registros** (`rotas/registros.ts`): acesso à planilha (senha) +
lista/busca/CRUD rodam na **mesma** `comConta` (`comAcessoColecao` /
`comAcessoRegistro`). Antes eram 2 transações por request (checar senha +
trabalho) — cada uma paga RTT no Neon.

**Lista de planilhas** (`listarColecoes`): um `SELECT` em lote em
`colecao_acessos` no lugar de N+1 por planilha protegida.

---

## 10. API completa (rotas)

Legenda: **Público** · **Sessão** (cookie) · **Admin** (`papel === 'dono'` na conta ativa) · **Workspace owner** (e-mail `WORKSPACE_OWNER_EMAIL`).

### Infra

| Método | Path | Auth |
|--------|------|------|
| GET | `/health` | Público (ping DB) |
| GET | `/api/config` | Público → `{ r2PublicBase, wsBase }` |
| GET | `/ws/presenca?ticket=` | Ticket one-shot |

### Auth

| Método | Path | Notas |
|--------|------|--------|
| POST | `/api/auth/registrar` | Token → membro; sem token → cria workspace + dono |
| POST | `/api/auth/entrar` | Token opcional (pedido/acesso) |
| POST | `/api/auth/olhar-token` | Não consome uso |
| POST | `/api/auth/pre-pedido` | E-mail+token → pedido |
| POST | `/api/auth/sair` | Revoga sessão |
| GET | `/api/auth/eu` | Sessão |
| GET | `/api/auth/contas` | Home + convidadas |
| POST | `/api/auth/trocar-conta` | Nova sessão na conta alvo |
| POST | `/api/auth/pedir-acesso` | Sessão |
| GET/POST | `/api/auth/pedidos-acesso…` | Admin aprovar/recusar |
| GET/PATCH/DELETE | `/api/auth/usuarios…` | Admin (papel, senha, delete) |
| PATCH | `/api/auth/codigo-convite` | Código legado |
| GET/POST/DELETE | `/api/auth/tokens-convite…` | Admin |

Rate-limit auth tipicamente 10/min (olhar-token 30/min).

### Conta / presença / lixeira

| Método | Path | Auth |
|--------|------|------|
| GET/PATCH | `/api/conta/edicao-trava` | Sessão |
| GET | `/api/presenca` | Sessão (fallback) |
| GET | `/api/presenca/ws-ticket` | Sessão |
| GET/POST/DELETE | `/api/lixeira…` | **Admin** |

### Coleções / campos / registros

| Método | Path | Notas |
|--------|------|--------|
| POST/GET | `/api/colecoes` | |
| GET | `/api/colecoes/:id` | Respeita senha/arquivo |
| POST | `/api/colecoes/:id/desbloquear` | Senha |
| PATCH/DELETE | `/api/colecoes/:id/senha` | |
| PATCH | `/api/colecoes/:id` | Renomear |
| POST | `/api/colecoes/:id/arquivar` \| `desarquivar` | Workspace owner |
| POST | `/api/colecoes/:id/duplicar` | |
| DELETE | `/api/colecoes/:id` | Soft → lixeira |
| POST | `/api/colecoes/:id/campos` | |
| PATCH | `/api/campos/:id` | |
| PATCH | `/api/colecoes/:id/campos/ordem` | |
| DELETE | `/api/campos/:id` | |
| GET | `/api/colecoes/:id/registros?before=` | Cursor por `ordem`; acesso+lista na **mesma** transação |
| GET | `/api/colecoes/:id/registros/busca?q=` | |
| POST | `/api/colecoes/:id/registros` | |
| PATCH | `/api/registros/:id` | Valores |
| PUT | `/api/registros/:id/corpo` | Corpo próprio |
| POST | `/api/registros/:id/mover` | `direcao` |
| DELETE | `/api/registros/:id` | Soft → lixeira |
| POST | `/api/registros/:id/upload` | Presigned R2 |

### Integrações / público

| Método | Path | Notas |
|--------|------|--------|
| CRUD | `/api/integracoes` | |
| POST | `/api/integracoes/:id/arquivar` \| `desarquivar` | Workspace owner |
| POST | `/api/registros/:id/link` | Código curto |
| POST | `/api/compartilhamentos/grupo` | Multi-parte |
| DELETE | `/api/registros/:id/link/:codigo` | Revogar |
| GET | `/api/publico/r/:codigo` | Público (DB ou HMAC legado) |

---

## 11. Auth, sessão, multi-conta

**Não há JWT de acesso.**

1. Cookie HTTP-only **`sessao`**, assinado (`COOKIE_SECRET`), `sameSite: 'lax'`, `secure` em prod, ~30 dias.
2. Valor = `sessoes.id` opaco (não o UUID da conta).
3. Senhas: **Argon2**.
4. `exigeDono` (nome histórico): qualquer usuário autenticado com sessão válida + membro ativo da conta da sessão.
5. `usuarioDaSessao` tem **cache em memória ~15s** (o join multi-conta rodava em
   todo request). Invalidação imediata em `revogarSessao` / revogar sessões da
   conta ou do usuário.

### Multi-conta

- Cada usuário tem **home** (`usuarios.conta_id`).
- Outras contas: `conta_membros` + token `convites_conta` (ou código legado).
- Fluxo típico: olhar token → pré-pedido (não gasta o único uso) → entrar/registrar → admin aprova → status `ativo`.
- Trocar conta = nova sessão apontando para outro `conta_id`.
- Papel efetivo: na home = `usuarios.papel`; convidado = `conta_membros.papel`.
- Admin (`dono`): usuários, tokens, lixeira, senhas de planilha (`podeGerirSenhas`).
- Remover usuário: FKs `criado_por` SET NULL (mig 021) + kick WS `acesso_revogado`.
- Revogar token: some da lista em Config (não fica como “token revogado”);
  membros ligados ao token perdem acesso na hora.

---

## 12. Realtime / WebSocket

Arquivo: `backend/src/ws/presencaHub.ts` — salas **em memória** por `contaId`.

### Fluxo

1. Cliente logado: `GET /api/presenca/ws-ticket` (60s, one-shot).
2. Conecta `GET /ws/presenca?ticket=…`.
3. Heartbeat: cliente `ping` ~25s → `pong`; `visto_em` no DB no máx. a cada 60s.
4. Timeout 60s; sweep 15s.
5. **Fly: 1 máquina só** — 2+ quebram presença (split-brain).

### Eventos JSON (`tipo`)

| tipo | Uso |
|------|-----|
| `presenca` | `{ online[], entradas[] }` |
| `entrada` | alguém logou |
| `registro` | criado \| atualizado \| apagado (+ colecaoId) |
| `trava` | `{ liberada }` |
| `pedido_acesso` | admin ao vivo |
| `acesso_revogado` | fecha socket (code 4001) |
| `ping` / `pong` | heartbeat |

Fallback REST: `GET /api/presenca` (poll ~20s se WS cair).

Frontend: `frontend/src/api/realtime.ts` + UI `ui/Presenca.tsx`.

---

## 13. Fotos e Cloudflare R2

### Princípio

- DB guarda só a **key** (string) no jsonb do campo imagem (array de keys).
- Bytes no R2; leitura pela URL pública `R2_PUBLIC_BASE/{key}`.

### Key gerada no servidor

```
{colecaoId}/{registroId}/{nano21}.jpg
```

Miniatura por **convenção de nome**: `foto.jpg` → `foto_t.jpg`.

### Upload (cliente → R2 direto)

1. Frontend `imagens/enviar.ts` → `gerarDerivadas`:
   - **Cheia**: ≤2560px JPEG ~0.88 (teto ~4 MB)
   - **Mini**: ≤240px JPEG 0.7 (teto ~200 KB)
2. `POST /api/registros/:id/upload` → `{ key, urlCheia, urlMini }` (presign PUT 60s, ContentType + ContentLength assinados).
3. Cliente PUT no R2 (só `content-type: image/jpeg` — CORS do bucket em `r2-cors.json`).
4. PATCH do registro com a key no array do bloco.

### UI de fotos

| Peça | Arquivo | Função |
|------|---------|--------|
| Grade | `imagens/Grade.tsx` | Upload, reordenar, remover, abre Visor; respeita `maxFotos` |
| Visor | `imagens/Visor.tsx` | Portal no `body`, grid `auto / 1fr / auto`, alinha ao `visualViewport` (mobile/desktop) para foto **alta** não ir sob o rodapé do app / home indicator |
| FotoZoomavel | `imagens/FotoZoomavel.tsx` | Blur-up mini→cheia, pinch/wheel zoom 1–4×, `object-fit: contain` na caixa do trilho |
| Miniatura | `preencher/Miniatura.tsx` | Lazy, fade-in, `urlMini` |
| urls | `imagens/urls.ts` | `definirBaseR2`, `urlCheia`, `urlMini` |

### Limites

| Limite | Valor |
|--------|--------|
| `maxFotos` por bloco (shared) | 1..30 |
| FormBloco (UI criar template) | costuma limitar a 10 |
| Import / criação automática | até 30 no bloco |
| Lote import Home | `MAX_FOTOS_LOTE = 100` (concorrência controlada) |
| MIME aceitos | jpeg / png / webp (normaliza p/ jpeg nas derivadas) |

### GC

- Soft-delete: fotos ficam no R2.
- Apagar definitivo na lixeira: `DeleteObject` + limpa keys.
- Órfãos: `lixo_r2` + `npm run limpar-r2` (script).

---

## 14. Importação, conversão e criação automática

Pasta: `frontend/src/importar/`.

### Regras de nome de arquivo (`importarFotos.ts`)

| Nome | Destino |
|------|---------|
| `4621.png` | Bloco de imagens da referência 4621 |
| `cor.vermelho.png` / `4621.cor.vermelho.png` | Seção **Cor**, linha vermelho |
| `4784.vermelho.png` | Cor se cor conhecida ou já existir no registro |
| `modelagem.png` | Bloco de imagem cujo nome casa com o arquivo |
| Sem match | Foto de referência (não se perde) |

Lista `CORES_CONHECIDAS`: dezenas de nomes PT (vermelho, bege, offwhite, terracota…).

Funções chave: `parseNomeArquivo`, `importarNaColecao`, `importarNoRegistro`,
`blocoImagemReferencia`, `blocoImagemPorNomeArquivo`, `todasReferencias`.

### Botões

| Componente | Onde | Função |
|------------|------|--------|
| `BotaoImportarFotos` | Preencher / ficha | Distribui por nome (coleção ou 1 registro) |
| `BotaoConversao` | Dentro da planilha | Cola refs → 1 foto/ref renomeada → import |
| `BotaoConversaoHome` | Home | Idem + escolher planilha(s) |
| `BotaoImportarZip` | Home | Backup (`dados.json` / `integracao.json`) ou texto+imagens |
| `BotaoCriacaoAutomatica` | Home | Texto colado (+ fotos) → planilha nova |

Na Home (mobile): Integrações + Converter fotos na 1ª linha; **Criação automático** e
**Importar de arquivo** lado a lado (`.inicio-acoes__par`). Mesmo par na tela vazia.

### Criação automática (`criacaoAutomatica.ts`)

- Registros separados **só** por linha `---`.
- Blocos: ponto final `.` (não quebra decimal `19.90`) e quebras de linha.
- Listas numeradas (`1 …` `2 …`) têm limpeza de ordinais.
- **`ESTOQUE_BLOCOS`**: dicionário nome escrito → bloco no registro:

| Escreve | Vira |
|---------|------|
| `4785` / `ref: 4785` | Referência |
| `cor: rosa` | Seção Cor |
| `modelagem` / `caderno` / `oficina` | Bloco de **fotos** com esse título |
| `imagem da referência` | Bloco padrão de fotos |
| `observação` / `tecido` / `tamanho` | Bloco de texto (pode nascer vazio) |
| `rótulo: valor` | Bloco nomeado |
| frase solta | Bloco Texto |

UI mostra a tabela “estoque” em `BotaoCriacaoAutomatica`.

---

## 15. Frontend — rotas, pastas, telas

### Rotas (`App.tsx`)

| Rota | Tela | Auth |
|------|------|------|
| `/entrar` | `Entrar` | Pública (logado → `/`) |
| `/` | `Inicio` | Protegida |
| `/c/:id` | `Colecao` | Protegida — modos **Criar** \| **Preencher** (não é rota separada) |
| `/integracoes` | `Integracoes` | Protegida |
| `/i/:id` | `Integrado` | Protegida |
| `/config` | `Config` | Protegida (admin) |
| `/lixeira` | `Lixeira` | Protegida (dono) |
| `/r/:token` | `RegistroPublico` | Pública |
| `*` | redirect `/` | |

Shell global (dentro de `ProvedorAuth`): `BotaoLixeiraFlutuante`, `Presenca`,
`AvisoPedidoAcesso`, `InstalarApp`.

### Pastas `frontend/src/`

| Pasta | Propósito |
|-------|-----------|
| `api/` | `cliente.ts` (REST), `cache.ts`, `prefetch.ts`, `realtime.ts`, runtime R2/WS |
| `contexto/` | `Auth.tsx` |
| `estilos/` | `tokens.css`, `base.css` |
| `ui/` | Botao, Campo, FolhaInferior, Chip, Segmentado, Carregando, Presenca… |
| `telas/` | Inicio, Colecao, Criar, Preencher, Integrado, Integracoes, Config, Lixeira, Entrar, TopoApp, FormBloco + CSS |
| `preencher/` | Ficha, ListaDensa, Tabela, Busca, Preview, CampoValor, SecaoEditor, CorpoRegistroEditor, Miniatura, compartilhar |
| `imagens/` | enviar, derivadas, Grade, Visor, FotoZoomavel, urls |
| `importar/` | fotos, conversão, ZIP, criação automática |
| `integracao/` | merge, FichaIntegrada, ParteEditor, PreviewIntegrado |
| `backup/` | export ZIP |
| `publico/` | página `/r/:token` |

### Telas — comportamento

**Inicio:** lista coleções + integrações ativas; criar; criação automática; ZIP;
conversão Home; arquivar (workspace owner); apagar (dono ou criador); ajuda
pós-cadastro (`sessionStorage mostruario_ajuda_inicio`).

Layout mobile (`.faixa--app` em `telas.css`): título “Suas planilhas” ~16px; barra
de ações em grade 2 colunas; cards mais baixos (~62px) com nome 14px / meta 11.5px
em `--tinta` (legível sobre o cartão claro). Botões da barra = `.btn--compacto`.

**Colecao `/c/:id`:** Segmentado Criar | Preencher. Criar = editar blocos do template
(`FormBloco`). Preencher = lista/tabela + ficha em `FolhaInferior`, busca, import,
backup, realtime. Se `bloqueada` → senha.

**Integracoes:** criar união (≥2 planilhas, ordem = ordem das partes), ligar/desligar,
reordenar, apagar.

**Integrado:** carrega N planilhas, agrupa por código de referência, modos Unidos/Geral,
preview, ficha unificada, chips para pular planilha, Preencher na parte certa, share, export.

**Config:** tokens, usuários, pedidos, senhas, link do app, trava.

**Entrar:** login / registro (conta nova ou token); confirma senha 2×; pré-pedido.

**Lixeira:** restaurar / apagar definitivo (admin).

**Público:** só leitura; 1 registro ou várias partes.

### Cliente API (`api/cliente.ts`)

- `fetch('/api/...')` + `credentials: 'same-origin'`
- Timeout ~60s; após ~4s sinaliza “servidor lento” (cold start raro — Fly fica ligado)
- `ErroApi(status, message)`
- Métodos cobrem auth, contas, coleções, campos, registros, corpo, mover, upload
  (só presign), integrações, lixeira, trava, presença, público
- `edicaoTrava()`: cache **em memória** na sessão (não refaz GET a cada abertura de
  planilha). Limpa em login / logout / troca de conta (`limparCacheEdicaoTrava`).
  Evento WS `trava` atualiza o cache.

---

## 16. Design system e estilização

### Metáfora: base de corte

Definida em `frontend/src/estilos/tokens.css`:

| Token | Cor / valor | Significado |
|-------|-------------|-------------|
| `--tapete` | `#1f2a26` | Fundo verde-escuro (mesa de corte) |
| `--tapete-2` | `#24312c` | Variação |
| `--papel` | `#f7f5ef` | Superfície clara de trabalho |
| `--papel-2` / `--cartao` | `#ffffff` | Campos / cartões |
| `--tinta` | `#17201c` | Texto principal (sobre papel) |
| `--tinta-2` | `#495650` | Secundário / placeholders legíveis |
| `--tinta-3` | `#7d8a83` | Terciário (usar com cuidado — some fácil) |
| `--giz` | `#eef3ec` | Texto/realce **sobre o tapete** |
| `--fita` | `#d98a3d` | Ação primária (fita métrica) |
| `--fita-forte` | `#c6771f` | Hover primário |
| `--perigo` | `#c0392b` | Destrutivo |
| `--visor-fundo` | `#14181a` | Fullscreen de fotos |
| `--linha` / `--linha-2` | beges | Bordas no papel |
| `--grade` | branco 6% | Grade 24px no tapete |
| `--fonte` | Inter | UI |
| `--mono` | Martian Mono | Etiquetas, códigos, números |
| `--e1`…`--e6` | 4…32px | Espaçamento |
| `--toque` | 44px | Alvo de toque mínimo |
| `--raio` / `--raio-2` | 8 / 12 | Cantos |
| `--sombra` / `--sombra-folha` | — | Elevação |

### `base.css`

- Body: tinta + fundo tapete + grade.
- `touch-action: pan-x pan-y` no documento (bloqueia zoom do browser; fotos têm gestos próprios).
- `.pagina`, `.faixa`, `.pagina--app` / `.faixa--app` / `.rolagem`: viewport fixo;
  só a lista interna rola (Home e planilha).
- `html.visor-aberto`: esconde chrome fixo (presença, FAB da lixeira, instalar)
  para não cobrir a foto.
- `.etiqueta`, `.mono`, `.visualmente-oculto`.

### Componentes UI (`ui/ui.css`)

- **Botao**: `primario` (fita), `padrao`, `fantasma`, `perigo`; bloco / ícone.
- **`.btn--compacto`**: **36px** de altura, fonte **13px**, ícone 14px — tamanho
  único da Home (ações + Criar) e da barra de registros (`.preencher-barra`),
  ficha (`.ficha__acoes-topo`) e prévia (`.preview-registro__acoes`).
- **Campo**: rótulo mono + input/textarea no papel; placeholder `--tinta-2` opacity 1.
- **FolhaInferior**: bottom sheet (modal); título; slot abaixo do título; corpo rolável; rodapé; variante `alta`.
- **Segmentado**, **Chip**, **Carregando**, **InstalarApp**.

### CSS por domínio

| Arquivo | Estiliza |
|---------|----------|
| `telas/telas.css` | Home, Entrar, Config, cartões, ajuda pós-cadastro |
| `telas/colecao.css` | Modo criar, título editável (giz no tapete) |
| `telas/integracao.css` | Setup Integrações (texto claro no tapete) + vista unida no papel |
| `telas/lixeira.css` | Lixeira |
| `preencher/preencher.css` | Lista, tabela, ficha, preview, skeletons |
| `preencher/secao.css` | Linhas da seção |
| `preencher/valores.css` | Controles de valor |
| `imagens/imagens.css` | Grade; visor em **CSS grid** (`auto minmax(0,1fr) auto`); trilho `min-height: 0`; foto `object-fit: contain`; tiras + `visor__base-segura` (1 foto reserva home-indicator) |
| `importar/importar.css` | Folhas de import/conversão/estoque |
| `publico/publico.css` | Página pública |
| `ui/presenca.css`, `avisoPedido.css`, `botao-lixeira.css` | Extras |

### Armadilha de contraste

- Sobre **tapete**: usar `--giz` / branco.
- Sobre **papel/folha**: usar `--tinta` / `--tinta-2` — **nunca** `--giz` (some).
- Integrações (setup): classe `.integ-setup` força texto claro.

---

## 17. Modelo de UI: blocos, seções, corpo próprio

### Template vs corpo próprio

- Coleção tem `campos[]` (template compartilhado).
- Registro sem `campos` → herda template.
- Registro com `campos` → estrutura independente; editar não altera os outros.
- Persistência: `PUT /api/registros/:id/corpo`.
- “Novo registro unificado” na integração deve herdar o **corpo recente**, não um modelo antigo.

### Seção (`tipo: 'secao'`)

- Valor = array de linhas: `{ [subcampoId]: valor }[]`.
- Subcampo imagem → Grade por célula.
- **Cor** na prática: seção com subcampo texto (nome da cor) + subcampo imagem (fotos).
- Import cria linha da cor se ainda não existir.

### Título do registro

- Bloco com `config.ehTitulo` e/ou heurística de referência (`derivarResumo.ts`).
- Código de referência = primeiro token com dígitos (normalizado) — base do merge.

### Autosave

- Ficha / FichaIntegrada: debounce (~300ms) em PATCH de valores.
- Ordem manual: `POST .../mover` altera `ordem`.

---

## 18. Integrações (planilhas unidas)

### Backend

Só CRUD de `integracoes` (nome, `colecao_ids` ordenado, ativo, arquivada).
**Não** mescla dados no Postgres.

### Frontend (`integracao/merge.ts`)

1. Para cada registro, `chaveReferencia` = código inicial do bloco Referência/título.
2. Mesma chave em planilhas diferentes → um `RegistroIntegrado` com `partes[]`.
3. Duplicatas na mesma planilha → “zip” por posição (nada some).
4. Sem referência → grupo `solto:*` (modo Geral).
5. `colecaoVirtual` / `registroVirtual` só em memória para preview/ficha.

### UI

- Chips das planilhas **fora** da viewport para pular.
- Botão **Preencher** abre edição já na parte certa.
- Header sticky na prévia / busca.
- Compartilhar grupo → `partes` no compartilhamento.

---

## 19. Cache, prefetch, PWA

| Peça | Comportamento |
|------|----------------|
| `cache.ts` | localStorage `mostruario:cache:v1:`; SWR ~7 dias; limpa no logout / troca de conta |
| `prefetch.ts` | Home: `requestIdleCallback` (timeout 2,5s), **até 3** planilhas, **concorrência 1** — não disputa banda com auth/presença |
| Trava | cache em memória em `cliente.ts` (ver §15) |
| PWA | `vite-plugin-pwa`, nome Mostruário, `theme_color` tapete, `autoUpdate`, navigateFallback denylist `/api` `/health` `/ws` |
| Fontes | CacheFirst Google Fonts (1 ano) |
| Chunks | `react-vendor`, `ui-vendor` |

**Não** cachear bytes de foto no localStorage — só keys/URLs públicas.

---

## 20. Lixeira, arquivar, senha, trava

### Lixeira

- DELETE registro/coleção → snapshot em `lixeira_*`; R2 intacto.
- Listar / restaurar / apagar definitivo: **admin da conta**.
- Definitivo: remove DB + objects R2.

### Arquivar

- `arquivada = true` → some para todos **exceto** `WORKSPACE_OWNER_EMAIL`.
- Diferente de senha: sem desbloqueio; só o workspace owner arquiva.

### Senha de planilha

- `colecoes.senha_hash` (Argon2).
- Desbloqueio grava `colecao_acessos`.
- API devolve `protegida` / `bloqueada`.
- Acesso livre: papel dono **ou** e-mail em `PLANILHA_ACESSO_LIVRE_EMAILS`.
- Trocar senha invalida desbloqueios.

### Trava de edição

- `contas.edicao_liberada` (default false).
- Broadcast WS `trava`.
- Frontend respeita alavanca no Preencher; GET só no 1º uso da sessão (cache).

---

## 21. Backup / export / import ZIP

### Export (`backup/exportarColecao.ts`)

- Gera ZIP com JSON da estrutura + imagens em alta.
- Funciona para coleção e para integração (várias planilhas).

### Import (`importar/importarBackup.ts`)

- Detecta `dados.json` / `integracao.json` do backup.
- Recria coleções, campos, registros, corpos, sobe fotos no R2.
- Round-trip esperado: baixar → importar → igual ao original.

### Import texto+imagens (ZIP simples)

- Via `importarTexto` / fluxo do `BotaoImportarZip` quando não é backup completo.

---

## 22. Convenções, armadilhas e checklist para a próxima IA

### Convenções

1. Migrations só aditivas; nunca “limpar o banco” em prod.
2. Tipos de domínio em `shared/tipos.ts` — não duplicar.
3. SQL só em `repositorios/` (+ `comConta`).
4. Validação de entrada com Zod em `validacao/`.
5. Frontend: paths relativos `/api`; config runtime para R2/WS.
6. Presença = 1 máquina Fly; não escalar horizontal sem Redis/NOTIFY.
7. Responder ao usuário em português (produto PT-BR).

### Armadilhas conhecidas

| Armadilha | Detalhe |
|-----------|---------|
| Giz no papel | Texto some — usar tinta |
| Token de convite 1 uso | Pré-pedido **não** deve consumir; Entrar consome |
| RLS | Esquecer `comConta` = query vazia ou erro |
| PgBouncer | Migrations na URL **direct** |
| Presign CORS | Não enviar headers extras no PUT R2 |
| Integração | É visão — não “salvar merge” no DB |
| Corpo próprio | Novo unificado deve copiar corpo recente |
| maxFotos | Shared 30; UI template às vezes 10 |
| Vercel `/ws` | Não passa pelo rewrite — cliente usa `wsBase` direto |
| Foto alta no visor | Sem grid + `min-height: 0` a foto vaza sob o footer; alinhar ao `visualViewport` |
| Duplo `comConta` em GET registros | Custa 2 RTT Neon; usar `comAcessoColecao` |
| Prefetch agressivo | 6×2 requests na Home deixam a lista lenta; manter limite 3 / conc. 1 |
| Fly `auto_start_machines = false` | Máquina parada = login falha até `fly machine start` |

### Checklist ao implementar feature

- [ ] Precisa migration? Número seguinte, aditiva, documentar aqui.
- [ ] Tipos em `shared`?
- [ ] Rota + repositório + Zod?
- [ ] RLS / `comConta`?
- [ ] Broadcast WS se outros clientes precisam ver?
- [ ] UI: contraste tapete vs papel?
- [ ] Fotos: keys only; derivadas cheia+mini?
- [ ] Soft-delete vs hard-delete?
- [ ] Deploy: muda backend → Fly CI; só front → Vercel.

### Arquivos “comece por aqui”

| Objetivo | Arquivo |
|----------|---------|
| Tipos | `shared/tipos.ts` |
| Boot API | `backend/src/server.ts` |
| Env | `backend/src/config.ts` |
| Sessão | `backend/src/auth/` |
| Upload | `backend/src/r2/r2.ts` + `frontend/src/imagens/enviar.ts` |
| Import fotos | `frontend/src/importar/importarFotos.ts` |
| Criação automática | `frontend/src/importar/criacaoAutomatica.ts` |
| Merge integração | `frontend/src/integracao/merge.ts` |
| Design tokens | `frontend/src/estilos/tokens.css` |
| Cliente HTTP | `frontend/src/api/cliente.ts` |
| Rotas UI | `frontend/src/App.tsx` |
| Deploy | `fly.toml`, `vercel.json`, `Dockerfile` |

---

*Documento atualizado (ago/2026) para cobrir migrations até
`023_conta_membros_papel.sql`, multi-conta, home compacta + botões 36px,
visor sem corte, path quente de registros numa transação, cache de sessão/trava,
prefetch leve e pipeline Vercel ↔ Fly ↔ Neon ↔ R2.*
