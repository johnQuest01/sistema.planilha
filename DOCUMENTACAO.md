# Documentação do projeto (para humanos e para a próxima IA)

> Este arquivo explica o projeto inteiro: o que é, a arquitetura, o banco de dados e
> as migrations, o formato dos dados (planilhas, blocos, registros, seções, imagens),
> o backend, o frontend, a API, o deploy e as convenções/armadilhas. O objetivo é que
> qualquer pessoa — ou outra IA — consiga entender e evoluir o sistema com segurança.
>
> Regra de ouro do projeto: **nunca apagar dados**. Migrations são aditivas; a exclusão
> de registros/planilhas é sempre "soft-delete" (lixeira) até o "apagar definitivo".

---

## 1. Visão geral

É um app web (PWA) de **planilhas visuais / mostruário**: cada **planilha** (`coleção`)
guarda **registros** (linhas/cartões), e cada registro é composto por **blocos**
(`campos`) — texto, número, seleção, data, imagem, seção repetível etc. É muito usado
para catálogos com **referência + fotos + cor** (ex.: planilhas "MODELAGEM", "Caderno
do Hugo", "Oficina").

Características centrais:

- **Schema como dado**: os blocos de uma planilha são LINHAS na tabela `campos`; os
  valores do registro moram num `jsonb` (`registros.valores`). Não há `ALTER TABLE` em
  runtime nem EAV.
- **Corpo próprio por registro**: um registro pode ter sua própria estrutura de blocos
  (`registros.campos` em jsonb), independente da planilha.
- **Multi-tenant + workspace compartilhado**: tudo é isolado por `conta` via RLS do
  Postgres; várias pessoas (`usuarios`) logam e caem na MESMA conta-workspace.
- **Imagens no Cloudflare R2**: upload direto do navegador via URL pré-assinada; o
  registro guarda só a **key**. Duas derivadas: "cheia" (2560px) e "mini" (240px).
- **Tempo real**: WebSocket de presença + eco de mudanças de registro entre clientes.
- **Integrações**: unir várias planilhas numa "planilha só", casando registros por
  referência (ex.: a Oficina une Modelagem + Caderno do Hugo).

---

## 2. Arquitetura e stack

Monorepo com **npm workspaces** (raiz `package.json`): `backend`, `frontend`, e uma
pasta `shared` (tipos compartilhados por ambos via caminho relativo `../../shared`).

```
sistema.planilha-main/
├─ backend/            # API Fastify (TypeScript) + migrations SQL
│  ├─ migrations/      # 001..018 .sql + run.ts (runner)
│  └─ src/
│     ├─ server.ts     # bootstrap Fastify (plugins, rotas, health)
│     ├─ config.ts     # leitura das variáveis de ambiente
│     ├─ db/           # client (postgres.js), comConta (RLS), schemaPronto
│     ├─ auth/         # sessões, cookies, senha (argon2), workspace, exigeDono
│     ├─ rotas/        # colecoes, campos, registros, auth, integracoes, ...
│     ├─ repositorios/ # acesso a dados por tabela
│     ├─ validacao/    # schemas Zod (campo, valores, colecao, upload, ...)
│     ├─ r2/           # Cloudflare R2 (presign, keys)
│     ├─ ws/           # WebSocket (presencaHub, rotasWs)
│     ├─ publico/      # link público (assinatura/verificação)
│     └─ scripts/      # limparR2 (GC de órfãos no bucket)
├─ frontend/           # SPA React + Vite (PWA)
│  └─ src/
│     ├─ App.tsx       # rotas (react-router-dom) + guarda de auth
│     ├─ main.tsx      # bootstrap React (createRoot, StrictMode)
│     ├─ api/          # cliente REST, realtime (ws), cache SWR, runtime (wsBase), prefetch
│     ├─ contexto/     # Auth (contexto React)
│     ├─ telas/        # Inicio, Colecao, Criar, Preencher, Integrado, Integracoes, Config, Lixeira, Entrar, TopoApp, FormBloco
│     ├─ preencher/    # Ficha, ListaDensa, Tabela, BuscaReferencia, RegistroPreview, CampoValor, SecaoEditor, CorpoRegistroEditor, derivarResumo, valoresVazios, compartilhar
│     ├─ imagens/      # derivadas, enviar, urls, Grade, Visor, FotoZoomavel (Miniatura fica em preencher/)
│     ├─ importar/     # criacaoAutomatica, importarFotos, importarTexto, importarBackup + botões
│     ├─ backup/       # exportarColecao (backup de planilha e de integração)
│     ├─ integracao/   # merge, FichaIntegrada, ParteEditor, PreviewIntegrado
│     ├─ ui/           # Botao, Campo, Segmentado, Chip, IconeTipo, FolhaInferior, Carregando, Presenca, InstalarApp, BotaoLixeiraFlutuante, useVoltar, useMedia, travaScroll
│     ├─ estilos/      # tokens.css (design tokens) + base.css (reset + app shell)
│     └─ publico/      # RegistroPublico (link público /r/:token, só leitura)
├─ shared/
│  └─ tipos.ts         # tipos TypeScript compartilhados (Campo, Colecao, Registro, ...)
├─ Dockerfile          # imagem do backend (Fly)
├─ fly.toml            # config do backend no Fly.io
├─ vercel.json         # rewrites do frontend (proxy /api -> Fly)
└─ .github/workflows/deploy-fly.yml  # CI que sobe o backend no push (paths do backend)
```

### Stacks

- **Backend**: Node 20, **Fastify 5** (TypeScript). Plugins: `@fastify/cors`,
  `@fastify/helmet`, `@fastify/cookie`, `@fastify/rate-limit`, `@fastify/websocket`.
  Banco via **postgres.js** (`postgres`), validação com **Zod**, senha com
  **@node-rs/argon2**, storage com **@aws-sdk/client-s3** + `s3-request-presigner`.
- **Frontend**: **React 18**, **Vite 5**, **react-router-dom 6**,
  **@tanstack/react-virtual** (listas grandes), **lucide-react** (ícones),
  **jszip** (backup/import), **vite-plugin-pwa** (offline/instalável).
- **Banco**: **PostgreSQL (Neon)**, região `sa-east-1` (SP), com RLS.
- **Storage**: **Cloudflare R2** (bucket `mostruario-midia`), servido pelo domínio
  público `pub-...r2.dev`.
- **Deploy**: backend no **Fly.io** (app `mostruario-api`, região `gru`), frontend na
  **Vercel** (`sistema-planilha-backend.vercel.app`).

---

## 3. Como rodar, buildar e deployar

### Dev (local)

```bash
npm install                 # na raiz (instala os workspaces)
npm run dev                 # sobe backend (tsx watch) + frontend (vite) juntos
# ou separadamente:
npm run dev:backend
npm run dev:frontend
```

- Backend precisa de `backend/.env` com pelo menos `DATABASE_URL` (Neon) e, para
  upload, as `R2_*`. Rode as migrations: `npm run migrate`.
- Frontend fala com `/api` (mesma origem). Em dev, o Vite serve o front e a API roda
  em `:3333` (o cliente usa caminhos relativos; ver `vercel.json`/proxy).

### Build

```bash
npm run typecheck           # tsc nos dois workspaces
npm run build               # build backend (tsc) + frontend (vite)
```

### Deploy

- **Backend (Fly)**: `Dockerfile` builda o backend e, ao subir, roda
  `npm run migrate` (aplica migrations pendentes) e `npm run start`. O deploy é
  automático via GitHub Actions (`.github/workflows/deploy-fly.yml`) **apenas quando
  mudam** `backend/**`, `shared/**`, `Dockerfile`, `fly.toml` ou os manifests. Exige o
  secret `FLY_API_TOKEN` no repositório. Também dá para disparar manualmente
  (workflow_dispatch) ou `flyctl deploy --remote-only`.
- **Frontend (Vercel)**: deploy automático a cada push na `main`. `vercel.json` faz o
  rewrite de `/api/:path*` e `/health` para `https://mostruario-api.fly.dev`.
- **Migrations** rodam sozinhas no boot do container (idempotentes; ver §6). O
  `server.ts` ainda chama `garantirSchemaPronto()` no boot e **não sobe** se faltar
  schema crítico (checa `colecoes.senha_hash` + tabela `colecao_acessos`).
- Fly roda **1 máquina só** (min_machines_running=1, sem auto-stop): a presença em
  tempo real é mantida **em memória por máquina**; com 2+ máquinas o WebSocket
  quebraria (split-brain). Health check em `GET /health`.
- Existe também um blueprint alternativo `render.yaml` (deploy no Render, mesmo
  build/start) — não é o deploy ativo, mas serve de referência.
- Backup do R2: workflow `.github/workflows/backup-r2.yml` roda `scripts/backup-r2.mjs`
  todo dia (cron 06:00 UTC), copiando incrementalmente o bucket de mídia para um bucket
  de backup (nunca apaga). Usa envs próprias: `R2_BACKUP_BUCKET`, `R2_SRC_ACCESS_KEY_ID`,
  `R2_SRC_SECRET_ACCESS_KEY`, `R2_DST_ACCESS_KEY_ID`, `R2_DST_SECRET_ACCESS_KEY`.

---

## 4. Variáveis de ambiente (backend)

Lidas em `backend/src/config.ts` (e `r2/r2.ts` para as R2). Não-secretas ficam no
`fly.toml [env]`; segredos vão por `fly secrets set`.

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | conexão Postgres (Neon) **POOLED** (host com `-pooler`) usada pelo app. |
| `DATABASE_URL_DIRECT` | migrations | usada pelo runner de migrations (DIRECT, sem PgBouncer); cai para `DATABASE_URL` se ausente. |
| `PORT` | não (3333) | porta do servidor. |
| `NODE_ENV` | — | `production` em prod (exige `COOKIE_SECRET`). |
| `CORS_ORIGIN` | não | origem liberada no CORS (a URL do frontend). |
| `COOKIE_SECRET` | prod: sim | assina o cookie de sessão. Em dev tem fallback. |
| `LINK_PUBLICO_SEGREDO` | não | assina os links públicos; sem env, reusa `COOKIE_SECRET`. Trocar revoga todos os links. |
| `LINK_PUBLICO_DIAS` | não (30) | validade do link público em dias (0 = nunca). |
| `WORKSPACE_OWNER_EMAIL` | não | e-mail do dono do workspace (todo cadastro cai na conta dele). Default: `brunoacre07@gmail.com`. |
| `PLANILHA_ACESSO_LIVRE_EMAILS` | não | e-mails que não precisam digitar a senha da planilha "Oficina" (lista por vírgula). |
| `R2_ACCOUNT_ID` | upload | conta Cloudflare R2. |
| `R2_ACCESS_KEY_ID` | upload | credencial R2. |
| `R2_SECRET_ACCESS_KEY` | upload | credencial R2. |
| `R2_BUCKET` | upload | nome do bucket (ex.: `mostruario-midia`). |
| `R2_PUBLIC_BASE` | upload | base pública das imagens (ex.: `https://pub-...r2.dev`). |
| `WS_PUBLIC_BASE` | não | base pública do WebSocket (ex.: `wss://mostruario-api.fly.dev`). |

---

## 5. Modelo de dados (conceitual)

- **Coleção (`Colecao`)** = uma planilha. Tem `nome` e uma lista de **campos**
  (o schema compartilhado). Pode ter senha (Oficina) e estar arquivada.
- **Campo (`Campo`)** = um **bloco** do registro. Tem `nome`, `tipo`, `ordem` e
  `config`. Tipos: `texto`, `paragrafo`, `numero`, `imagem`, `selecao`, `data`,
  `datahora`, `booleano`, `secao`.
- **Registro (`Registro`)** = uma linha/cartão. Tem `valores` (mapa `campoId -> valor`)
  e, opcionalmente, **`campos` (corpo próprio)** — quando presente, a estrutura de
  blocos daquele registro é independente da coleção.
- **Seção (`secao`) e Subcampo (`SubCampo`)**: um bloco `secao` contém `subcampos`
  (quadradinhos) que se repetem por **linha**. O valor de uma seção é um array de
  linhas; cada linha é um objeto `{subcampoId: valor}`. Subcampo pode ser imagem
  (foto por linha), mas não pode aninhar outra seção.
- **Integração (`Integracao`)**: une várias coleções (`colecaoIds` ORDENADO) numa
  visão só, casando registros por **referência**. É só configuração/visão — não altera
  coleções/registros. Ligar/desligar (`ativo`) não toca em dado nenhum.

Os tipos canônicos vivem em `shared/tipos.ts` (`Campo`, `ConfigCampo`, `SubCampo`,
`Registro`, `Colecao`, `Integracao`, `Usuario`, `ItemLixeira`, `TipoCampo`).

### `ConfigCampo` (config de um bloco/subcampo)

```ts
interface ConfigCampo {
  opcoes?: string[];   // selecao
  sufixo?: string;     // numero (ex.: "kg", "R$")
  obrigatorio?: boolean;
  maxFotos?: number;   // só 'imagem' (1..30, default 1)
  autoAgora?: boolean; // data/datahora: já vem preenchido ao criar
  subcampos?: SubCampo[]; // secao
  titulo?: string;     // cabeçalho exibido acima do bloco
  ehTitulo?: boolean;  // marca este bloco como fonte do TÍTULO do registro
}
```

### Formato de `registros.valores` por tipo

```jsonc
{
  "<campoId texto/paragrafo>": "texto livre",
  "<campoId numero>": 12.5,
  "<campoId data>": "2026-08-09",              // YYYY-MM-DD
  "<campoId datahora>": "2026-08-09T14:30",     // YYYY-MM-DDTHH:mm
  "<campoId booleano>": true,
  "<campoId selecao>": "uma das opcoes",
  "<campoId imagem>": ["<key R2>", "<key R2>"], // array de keys
  "<campoId secao>": [                            // array de linhas
    { "<subId cor>": "rosa", "<subId foto>": ["<key R2>"] },
    { "<subId cor>": "preto", "<subId foto>": [] }
  ]
}
```

- `null` num campo = "limpar" (o PATCH é merge; gravar `null` faz o campo aparecer
  vazio na leitura). Chave que não é id de campo da coleção é **rejeitada** (`.strict()`).

### Key de imagem no R2 (formato exato)

```
<colecaoId uuid>/<registroId uuid>/<nano21>.<jpg|png|webp>
```

- A key é **sempre gerada pelo servidor** (`r2/r2.ts → novaKey`). O cliente nunca
  escolhe — é a única proteção num bucket público.
- A **miniatura** é por convenção: `.<ext>` → `_t.<ext>` (`keyMini`). Não se guarda a
  key da mini no jsonb; ela é derivada.
- O validador (`validacao/valores.ts`) exige exatamente esse formato via regex `R2_KEY`.

---

## 6. Banco de dados e migrations

- **Runner**: `backend/migrations/run.ts`. Cria a tabela `_migrations` (nome PK),
  lê os `*.sql` da pasta em ordem alfabética e aplica os que ainda não constam, cada um
  numa transação. Idempotente. Usa `DATABASE_URL_DIRECT` (ou `DATABASE_URL`).
- **RLS (Row-Level Security)**: caminho "DONO" abre transação e faz
  `select set_config('app.conta_id', <uuid>, true)` (ver `db/comConta.ts`). As
  políticas filtram tudo por `conta_id`. Como o app conecta com a role dona, usa-se
  `FORCE ROW LEVEL SECURITY` → sem `set_config`, `current_setting('app.conta_id', true)`
  é NULL e **nada aparece** (deny por padrão). Tabelas de auth (`contas`, `usuarios`,
  `sessoes`) e filas de manutenção (`lixo_r2`) ficam FORA da RLS de conta — a auth
  media o acesso e as rotas filtram por `conta_id` explicitamente.

### Tabelas (estado final após as migrations 001–020)

> Arquivos `001`–`020`, com **dois** de prefixo `015` (`015_compartilhamentos` e
> `015_integracoes`). O runner ordena por nome.

| Tabela | Colunas principais | Observações |
|---|---|---|
| `contas` | id, email(unique), senha_hash, nome, codigo_convite_hash, edicao_liberada, criado_em | Workspace isolado. `nome` = rótulo amigável (mig. 020). |
| `usuarios` | id, conta_id, nome, email(unique), senha_hash, papel(`dono`\|`membro`), visto_em, criado_em | Login; cada um pertence a **uma** conta. |
| `convites_conta` | token(PK), conta_id, rotulo, criado_por, expira_em, revogado_em, usos, max_usos, criado_em | Tokens do admin para outros entrarem na conta (fora da RLS; mig. 020). |
| `sessoes` | id(text PK), conta_id, usuario_id, criado_em, expira_em, revogado_em | Cookie carrega `sessoes.id` (opaco). Fora da RLS. |
| `colecoes` | id, conta_id, nome, criado_por(→usuarios), senha_hash, arquivada, criado_em, atualizado_em | Planilha. `senha_hash` = senha da planilha (Oficina). |
| `campos` | id, colecao_id, nome, tipo, ordem, config(jsonb), criado_em | Blocos compartilhados da planilha (o schema). |
| `registros` | id, colecao_id, valores(jsonb), campos(jsonb, nullable), criado_por(text), criado_por_id(→usuarios), ordem(double), criado_em, atualizado_em | `campos` = corpo próprio (null = herda da coleção). `ordem` = ordem manual (maior no topo). |
| `convites` | token(PK), colecao_id, papel(`preencher`\|`ler`), expira_em, revogado_em | Reservada para a "Fase 6" (link de preenchimento com role separada). **Sem rotas ativas** hoje — o compartilhamento atual é só o link público read-only. |
| `compartilhamentos` | codigo(PK), conta_id, registro_id, blocos, partes(jsonb\|null), titulo, expira_em, revogado_em, criado_por, criado_em | Link público CURTO (1 registro ou unido via `partes`). SELECT público liberado; escrita só do dono. |
| `integracoes` | id, conta_id, nome, colecao_ids(jsonb ordenado), ativo, arquivada, criado_por, criado_em, atualizado_em | Une planilhas por referência. Só configuração/visão. |
| `lixeira_registros` | id, conta_id, colecao_id, colecao_nome, registro_id, valores(jsonb), campos(jsonb), fotos_referencia(jsonb), criado_por/_id, criado_em, atualizado_em, apagado_em, apagado_por_id/_nome | Soft-delete de registro (snapshot completo, inclui corpo próprio). |
| `lixeira_colecoes` | id, conta_id, colecao_id, colecao_nome, snapshot(jsonb), fotos_referencia(jsonb), qtd_registros, criado_por, criado_em, atualizado_em, apagado_em, apagado_por_id/_nome | Soft-delete de planilha inteira (campos + registros). Restaurar recria com os mesmos ids. |
| `colecao_acessos` | (colecao_id, usuario_id) PK, criado_em | Quem já desbloqueou a senha da planilha. |
| `entradas` | id, conta_id, usuario_id, nome, criado_em | Log de logins ("Fulano entrou"). |
| `lixo_r2` | key(PK), motivo, criado_em, limpo_em | Fila de GC de imagens órfãs no R2 (`npm run limpar-r2` apaga o que tem >7 dias). |
| `_migrations` | nome(PK), aplicada_em | Controle do runner. |

### Migrations (resumo, em ordem)

- **001_init** — extensão pgcrypto; `contas`, `colecoes`, `campos`, `registros`,
  `convites`; índices (inclui GIN em `registros.valores`).
- **002_rls** — habilita e FORÇA RLS em colecoes/campos/registros/convites; política
  `conta_isola` por `app.conta_id`.
- **003_sessoes** — tabela `sessoes` (fora da RLS).
- **004_lixo_r2** — fila `lixo_r2` para GC de órfãos no bucket.
- **005_tipos_datahora_secao** — adiciona os tipos `datahora` e `secao` ao CHECK de
  `campos.tipo`.
- **006_usuarios_workspace** — cria `usuarios`; liga `sessoes.usuario_id`; adiciona
  `contas.codigo_convite_hash`, `colecoes.criado_por`, `registros.criado_por_id`;
  backfill (cada conta vira um usuário `dono`).
- **007_presenca** — `usuarios.visto_em` + tabela `entradas`.
- **008_lixeira_registros** — soft-delete de registros (com RLS).
- **009_lixeira_fotos_referencia** — `lixeira_registros.fotos_referencia` (prévia).
- **010_lixeira_colecoes** — soft-delete de planilhas (com RLS).
- **011_senha_oficina** — `colecoes.senha_hash` + `colecao_acessos`.
- **012_idx_registros_paginacao** — índice nomeado para paginação por `criado_em`.
- **013_conta_edicao_trava** — `contas.edicao_liberada` (alavanca de edição).
- **014_registro_corpo_proprio** — `registros.campos` e `lixeira_registros.campos`
  (corpo próprio por registro).
- **015_integracoes** — tabela `integracoes` (com RLS).
- **015_compartilhamentos** — tabela `compartilhamentos` (link público curto; SELECT
  público liberado por política).
- **016_colecao_arquivada** — `colecoes.arquivada`.
- **017_integracao_arquivada** — `integracoes.arquivada`.
- **018_registros_ordem** — `registros.ordem` (double, ordem manual; backfill = epoch
  do `criado_em`); índice `(colecao_id, ordem desc)` para paginação por cursor.
- **019_compartilhamentos_partes** — `compartilhamentos.partes` + `titulo` (link unido).
- **020_contas_multi_tenant** — `contas.nome` + tabela `convites_conta` (tokens por
  conta; cadastro cria workspace próprio ou entra com token).

> Nota: há dois arquivos com prefixo `015` (`015_integracoes.sql` e
> `015_compartilhamentos.sql`); o runner aplica por ordem alfabética, então
> `compartilhamentos` roda depois de `integracoes`. Ambos são independentes.

---

## 7. Segurança e multi-tenant

- **Cadastro dual** (`POST /api/auth/registrar`):
  - **Com token** (`token` ou `codigo`): entra como `membro` na conta do admin
    (`convites_conta`) — ou, legado, código da conta Bruno (`codigo_convite_hash`).
  - **Sem token**: cria **workspace novo** (`INSERT contas` + usuário `dono`).
    Dados isolados por `conta_id` + RLS — nunca misturam com outras contas.
- **Tokens**: tabela `convites_conta` (migration `020`). Admin gera/lista/revoga em
  Config (`/api/auth/tokens-convite`).
- **Login**: `usuarios` (e-mail único global). Senha **argon2** (`auth/senha.ts`).
- **Sessão**: cookie assinado com `sessoes.id`. `auth/sessoes.ts`, `auth/cookies.ts`.
- **Papéis**: `dono` = admin da **própria** conta (Config/engrenagem, tokens,
  usuários, lixeira restaurar/apagar definitivo, senhas, arquivar). `membro` =
  preenche/cria, sem essas telas. O preHandler `exigeDono` só exige sessão; o
  papel é checado rota a rota.
- **RLS por conta**: `comConta(contaId, fn)` (ver §6).
- **Senha por planilha (Oficina)**: `colecoes.senha_hash` + `colecao_acessos`.
- **Arquivamento**: `colecoes.arquivada` / `integracoes.arquivada` — some para
  membros; admin desarquiva.
- **Link público**: `compartilhamentos` (código curto). `rotas/publico.ts`.
- **Rate limit** / **Helmet** / **CORS** como antes.
- Ver também `atualizacao.MD` (pedido multi-conta organizado).

---

## 8. Backend em detalhe

- **`server.ts`** — `buildServer()` registra: websocket, helmet, cors, cookie,
  rate-limit e as rotas (`config`, `publico`, `conta`, `auth`, `colecoes`, `campos`,
  `registros`, `integracoes`, `upload`, `presenca`, `lixeira`) + `GET /health`.
  `bodyLimit` 64 KB (binário vai direto pro R2); `maxParamLength` 8192 (link público no
  path). ErrorHandler traduz `ZodError` → 400 `{erro:'validação', detalhes}`; demais
  usam `statusCode` do erro. No boot, `garantirSchemaPronto()` derruba o processo se o
  schema estiver velho (evita planilha "vazia").
- **`db/`** — `client.ts` (pool postgres.js, `ssl:'require'`, `max:10`),
  `comConta.ts` (transação + `set_config app.conta_id`), `schemaPronto.ts` (checagem de
  schema no boot).
- **`repositorios/`** — SQL por tabela: `colecoes`, `campos`, `registros`, `lixeira`,
  `integracoes`, `compartilhamentos`, `presenca`, `lixo`. Aqui moram as queries e as
  regras que dependem do estado do banco (ex.: mover/reordenar registro).
- **`validacao/`** — Zod: `campo.ts` (config de bloco/subcampo + `corpoRegistroSchema`
  para corpo próprio; aceita `colecaoId`/`ordem` "não confiáveis"), `valores.ts`
  (valores por tipo + `R2_KEY`), `colecao.ts`, `integracao.ts`, `upload.ts`,
  `credenciais.ts`, `params.ts`.
- **`r2/r2.ts`** — S3Client apontando pro endpoint R2; `novaKey`, `keyMini`,
  `presignPut` (assina ContentType + ContentLength; **sem** cache-control para não
  quebrar o preflight CORS do R2), `apagarObjeto`. Config R2 lida sob demanda (o app
  sobe sem R2; só o upload falha com mensagem clara). Detalhe importante: o SDK v3
  novo força checksum CRC32 que o R2 rejeita → `requestChecksumCalculation:
  'WHEN_REQUIRED'` + `unsignableHeaders` resolvem.
- **`ws/`** — `presencaHub.ts` (salas em memória por máquina) e `rotasWs.ts`
  (`/ws/presenca`, upgrade WebSocket). Por isso o Fly roda 1 máquina só.
- **`scripts/limparR2.ts`** — GC: apaga do bucket as keys de `lixo_r2` com >7 dias.

### Fluxo de upload de imagem (importante)

1. Cliente gera as 2 derivadas (cheia/mini) no canvas.
2. `POST /api/registros/:id/upload` com `{mime, tamanhoCheia, tamanhoMini}` →
   servidor gera a **key** e devolve `{key, urlCheia, urlMini}` (dois presigned PUT).
3. Cliente faz `PUT` das duas derivadas direto no R2 (só header `content-type`).
4. Cliente faz `PATCH` do registro guardando a **key** no bloco de imagem.

---

## 9. API REST (todos os endpoints)

Base: mesma origem do frontend; a Vercel faz proxy de `/api/*` para o Fly. Todas as
rotas (exceto `/api/config`, `/api/publico/*`, `/health` e auth de entrada) exigem
sessão (cookie). Fonte de verdade do lado do cliente: `frontend/src/api/cliente.ts`.

**Config / Auth**
- `GET /api/config` → `{ r2PublicBase, wsBase? }`
- `GET /api/auth/eu` → usuário logado
- `POST /api/auth/entrar` `{email, senha}`
- `POST /api/auth/registrar` `{nome, email, senha, codigo}`
- `POST /api/auth/sair`
- `PATCH /api/auth/codigo-convite` `{codigo}` (dono)
- `GET /api/auth/usuarios` (dono)
- `PATCH /api/auth/usuarios/:id/senha` `{senha}` (dono)

**Coleções**
- `GET /api/colecoes` → lista (resumo, sem campos)
- `POST /api/colecoes` `{nome}`
- `GET /api/colecoes/:id` → coleção com `campos`
- `POST /api/colecoes/:id/desbloquear` `{senha}`
- `PATCH /api/colecoes/:id/senha` `{senha}` / `DELETE /api/colecoes/:id/senha`
- `PATCH /api/colecoes/:id` `{nome}` (renomear)
- `POST /api/colecoes/:id/duplicar`
- `DELETE /api/colecoes/:id` (vai pra lixeira de coleções)
- `POST /api/colecoes/:id/arquivar` / `POST /api/colecoes/:id/desarquivar`

**Campos (blocos compartilhados)**
- `POST /api/colecoes/:colecaoId/campos` `{nome, tipo, config?}`
- `PATCH /api/campos/:id` `{nome?, tipo?, config?}`
- `PATCH /api/colecoes/:colecaoId/campos/ordem` `{ids: string[]}`
- `DELETE /api/campos/:id`

**Registros**
- `GET /api/colecoes/:colecaoId/registros?before=<cursor>` (paginação; cursor = `ordem`)
- `GET /api/colecoes/:colecaoId/registros/busca?q=<termo>`
- `POST /api/colecoes/:colecaoId/registros` `{valores, campos?}` — `campos` presente ⇒
  o registro nasce com **corpo próprio**.
- `PATCH /api/registros/:id` `{valores}` (merge; `null` limpa)
- `PUT /api/registros/:id/corpo` `{campos}` — torna o corpo do registro independente.
- `POST /api/registros/:id/mover` `{direcao: 'cima'|'baixo'}`
- `DELETE /api/registros/:id` (vai pra lixeira)

**Link público**
- `POST /api/registros/:registroId/link` `{campos: string[]}` → `{codigo}` (código curto)
- `POST /api/compartilhamentos/grupo` `{titulo?, partes:[{registroId,fonte,campos}]}` →
  `{codigo}` — link unido (várias planilhas num `/r/:codigo`; migração `019`)
- `DELETE /api/registros/:registroId/link/:codigo` — revoga um link específico
- `GET /api/publico/r/:codigo` → `{campos, valores, r2PublicBase}` **ou**
  `{titulo, partes:[{fonte,campos,valores}], r2PublicBase}` (sem login; aceita o
  **código curto** novo OU um **token assinado legado** — HMAC, se contiver `.`)

**Integrações**
- `GET /api/integracoes` / `GET /api/integracoes/:id`
- `POST /api/integracoes` `{nome, colecaoIds, ativo?}`
- `PATCH /api/integracoes/:id` `{nome?, colecaoIds?, ativo?}`
- `DELETE /api/integracoes/:id`
- `POST /api/integracoes/:id/arquivar` / `.../desarquivar`

**Lixeira**
- `GET /api/lixeira`
- `POST /api/lixeira/:id/restaurar`
- `DELETE /api/lixeira/:id` (apagar definitivo; remove keys do R2)

**Conta / Presença / Upload**
- `GET /api/conta/edicao-trava` / `PATCH /api/conta/edicao-trava` `{liberada}`
- `GET /api/presenca` → `{online, entradas}`
- `GET /api/presenca/ws-ticket` → `{ticket, expiraEm}` (para abrir o WS)
- `POST /api/registros/:registroId/upload` `{mime, tamanhoCheia, tamanhoMini}` →
  `{key, urlCheia, urlMini}`
- `WS /ws/presenca` (WebSocket; usa o ticket)

---

## 10. Frontend em detalhe

### Rotas (`src/App.tsx`)

- `/` → **Inicio** (lista de planilhas e planilhas unidas; criar/importar)
- `/c/:id` → **Colecao** (uma planilha: criar/preencher/registros)
- `/i/:id` → **Integrado** (planilha unida)
- `/integracoes` → **Integracoes** (gerir uniões)
- `/config` → **Config**
- `/lixeira` → **Lixeira**
- `/r/:token` → **RegistroPublico** (link público, sem login)
- Guarda de autenticação; telas carregadas com `lazy()`.

### Estado e dados (`src/api/`, `src/contexto/`)

- **`api/cliente.ts`** — funções REST (§9). Tratamento de "servidor lento" (cold start),
  timeout, e um fallback para backend antigo (remove chaves `null`).
- **`api/cache.ts`** — snapshots em `localStorage` para abrir as telas instantâneas
  (mostra o cache e revalida em background).
- **`api/realtime.ts`** — WebSocket: eco de `registro criado/atualizado/apagado` e
  presença; as telas assinam e atualizam a lista ao vivo.
- **`contexto/Auth`** — usuário logado, papel, login/logout.

### Fluxo "Preencher" (`src/preencher/`)

- **`Preencher.tsx`** — orquestra a planilha: barra/busca fixas e a **lista rolável**
  (app shell: `.pagina--app`/`.faixa--app`/`.rolagem` → só a lista rola).
- **`Ficha.tsx`** — editor de UM registro (autosave por bloco: debounce ~400ms + flush
  garantido ao fechar). Botão "Título" por bloco (marca `config.ehTitulo`). "Novo
  registro" herda a estrutura do registro mais recente.
- **`CampoValor.tsx`** — o input certo por tipo (texto/parágrafo/número+sufixo/
  data/datahora com "Hoje/Agora"/booleano/seleção). **`CorpoRegistroEditor.tsx`** —
  edita os blocos de UM registro (torna-o corpo próprio; PUT `/corpo`). **`FormBloco.tsx`**
  (em `telas/`) — formulário de um bloco, reusado por `Criar` e pelos editores de corpo.
- **`telas/Criar.tsx`** — editor dos **blocos compartilhados da coleção** (adicionar/
  editar/reordenar/apagar campos) + prévia. Diferente do `CorpoRegistroEditor` (que
  mexe só num registro).
- **Alavanca de edição** (`edicao-trava`): trava/destrava a edição por conta (salva no
  servidor, sincroniza ao vivo pelo evento `trava` do WebSocket).
- **`ListaDensa.tsx`** (mobile) e **`Tabela.tsx`** (desktop) — listas virtualizadas
  (`@tanstack/react-virtual`) que rolam dentro do container.
- **`BuscaReferencia.tsx`** — busca por referência. Os resultados são **cards
  compactos** (miniatura + título + resumo) que rolam por dentro; tocar abre a **prévia
  completa** (folha grande com X). Se a busca acha **exatamente 1** registro, a prévia
  **abre sozinha**. (Mesmo padrão vale na planilha unida.)
- **`RegistroPreview.tsx`** — prévia de um registro. Os botões (Renomear /
  Compartilhar / Abrir) vão no slot fixo **`folha__abaixoTitulo`** (logo abaixo do
  título da Folha, fora do scroll) — sem faixa cinza de “barra de UI”. Prop
  `fonte` = selo da planilha (prévia unida). Modo compartilhar: marca blocos e gera
  link (`criarLinkRegistro`) ou imagem.
- **`derivarResumo.ts`** — deriva **título**, **resumo**, **capa** e o **corpo efetivo**
  do registro (`camposDoRegistro` = corpo próprio OU o da coleção). Título vem do bloco
  marcado `ehTitulo`, senão do bloco "Referência".
- **`valoresVazios.ts`** — gera `valores` vazios a partir de um conjunto de campos
  (usado ao criar registro herdando estrutura).
- **`SecaoEditor.tsx`** — edita seções (linhas de subcampos); `linhasDe()` lê o array
  de linhas.

### Imagens (`src/imagens/`)

- **`derivadas.ts`** — `gerarDerivadas(file)`: **cheia** (lado máx 2560px, JPEG ~0.88,
  teto 4 MB) e **mini** (240px, 0.7, teto 200 KB). Fallback via `<img>` quando
  `createImageBitmap` falha (HEIC etc.). Sempre sai JPEG.
- **`enviar.ts`** — `enviarFoto(registroId, file)`: gera derivadas, pede presign,
  faz os 2 PUT no R2 e devolve a **key**.
- **`urls.ts`** — monta URLs pública/cheia/mini a partir da key + `r2PublicBase`.
- **`Visor.tsx`** (zoom), **`Grade.tsx`** (galeria), **`Miniatura.tsx`** (thumb).

### Integração unida (`src/integracao/` + `telas/Integrado.tsx`)

- **`merge.ts`** — casa registros por **referência** (`chaveReferencia`), monta o
  `RegistroIntegrado` (partes por coleção) e a lista unida.
- **`Integrado.tsx`** — tela da planilha unida (app shell: header/busca/filtro fixos,
  lista rolável). Busca → **cards compactos** → tocar abre a **prévia completa** (folha
  ALTA, quase tela cheia, com X); busca com 1 resultado abre sozinha. "Novo registro
  unificado" herda o corpo recente da 1ª planilha. Prévia com navegação entre planilhas
  (chips das fora de vista) + botão flutuante "Preencher" — que **some no modo
  compartilhar** para não cobrir os controles de compartilhar. Botão "Baixar backup"
  (backup da união inteira). Realtime: assina eventos de registro de TODAS as planilhas
  do grupo e recalcula os grupos — criar registro/fotos numa planilha membro reflete
  aqui na hora.
- **`FichaIntegrada.tsx`** — editor unido: edita cada planilha da referência num lugar
  só. Ao abrir, **cria automaticamente** os registros faltantes das planilhas do grupo
  (com a referência pré-preenchida) — todas já aparecem prontas para preencher, sem o
  passo "criar registro". Navegação por planilha (chips) e foco inicial na planilha
  escolhida pelo "Preencher" da prévia.
- **Barra global da prévia unida:** os mesmos 3 botões da Modelagem — **Renomear /
  Compartilhar / Abrir** — ficam **fixos abaixo do título da Folha** (não por
  planilha). Renomear aplica o nome em todas as partes com campo de título;
  Compartilhar marca blocos em **todas** as planilhas e gera **um** link
  (`POST /api/compartilhamentos/grupo`) ou imagem empilhada; Abrir abre o Preencher.

### Importação e backup

- **`importar/criacaoAutomatica.ts`** + **`BotaoCriacaoAutomatica`** — cria uma
  planilha a partir de TEXTO colado (blocos por ponto/label) + imagens do celular
  (nome do arquivo define o bloco: `4785.png`, `cor.rosa.png`, `imagem.da.referencia.png`).
- **`importar/importarFotos.ts`** + **`BotaoImportarFotos`** — importa fotos em massa
  numa planilha existente, distribuindo por referência/cor pelo nome do arquivo
  (ex.: `5412.cor.vermelho.png`), inclusive replicando por todas as linhas/registros da
  referência.
- **`importar/importarTexto.ts`** — importa um `.zip` de TEXTO (`.txt`/`.md`) + imagens
  soltas (cada nota separada por `---` vira um registro).
- **`importar/importarBackup.ts`** + **`BotaoImportarZip`** — **importa um BACKUP**
  (ver §11): detecta `dados.json`/`integracao.json` e recria a planilha (ou a união)
  igualzinha, com corpo próprio por registro e imagens reenviadas ao R2. Se o `.zip`
  não for backup, cai no importador de texto (pede o nome).
- **`importar/BotaoConversao.tsx`** — "Conversão": tira fotos uma a uma, cada uma
  renomeada com a próxima referência de uma lista, e aplica em massa.
- **`backup/exportarColecao.ts`** — **backup**: `exportarColecao` (uma planilha) e
  `exportarIntegracao` (planilha unida). Baixa TODOS os registros num `.zip` com as
  imagens em ALTA definição + um `dados.json` estruturado (ver §11).

### Estilo

- **Design tokens** em `estilos/tokens.css` (importado por `base.css`): superfícies
  (`--tapete`, `--papel`, `--cartao`), tinta (`--tinta`, `--tinta-2/3`), acentos
  (`--giz`, `--fita` = laranja de ação, `--perigo`), espaçamento `--e1..--e6`
  (4/8/12/16/24/32 px), alvo de toque `--toque` (44px), fontes `--fonte`/`--mono`.
- CSS puro (sem framework), **um `.css` por feature** (importado pelo componente).
- **App shell** de scroll contido (em `base.css`): `.pagina--app` fixa a altura,
  `.faixa--app` é coluna, só `.rolagem` recebe scroll — usado na Home, na planilha e na
  integrada (cabeçalho/busca fixos; só a lista/registros rola).
- Mobile × desktop é decidido em JS por `useMedia('(max-width: 768px)')` (lista densa ×
  tabela), além de media queries no CSS.

---

## 11. Formatos de importação e backup (round-trip)

### Backup de uma planilha (`exportarColecao`)

Gera `backup-<nome>.zip` com:
- `dados.json` na raiz: `{ exportadoEm, colecao:{id,nome,campos}, registros:[{id,
  criadoEm, atualizadoEm, campos(corpo próprio|null), valores, imagens}] }`, onde
  **`imagens`** é o mapa `keyAntiga -> caminho relativo do arquivo no zip` (`''` quando
  a foto não pôde ser baixada).
- Uma pasta por registro (numerada, com referência + cor no nome), contendo
  `informacoes.txt` (texto legível) + as imagens em alta definição.
- `LEIA-ME.txt` e, se faltou alguma foto, `_imagens-que-faltaram.txt`.

### Backup de uma planilha unida (`exportarIntegracao`)

Gera `backup-unido-<nome>.zip` com:
- `integracao.json` na raiz: `{ nome, membros:[{nome, id, pasta}] }`.
- Uma **subpasta por planilha membro**, cada uma com seu próprio `dados.json` +
  pastas de registro com imagens (mesmo formato acima).

### Importação de backup (`importarArquivoBackup`)

- Detecta `integracao.json` (união) ou `dados.json` (coleção). Se não achar nenhum,
  lança `NaoEhBackup` e o `BotaoImportarZip` cai no importador de texto.
- Para cada registro: cria com **corpo próprio** = `registro.campos` (ou os campos da
  coleção), preservando os **ids** dos blocos → os `valores` continuam batendo. As
  imagens são **reenviadas** ao R2 (`enviarFoto`) ganhando keys novas; `remapValores`
  troca as keys antigas pelas novas dentro dos `valores` (em blocos de topo e em
  seções) e descarta as que falharam. Registros criados do mais antigo ao mais novo
  para preservar a ordem.
- União: recria cada planilha membro e depois cria a `integracao` ligando os novos ids.
- Importar **sempre cria planilhas novas** (não sobrescreve nada).

---

## 12. Convenções e armadilhas (aprendizados)

- **Nunca apagar dados**: exclusão é soft-delete (lixeira). Migrations são aditivas.
- **RLS deny-by-default**: fora de `comConta`, nenhuma query "dono" enxerga linhas.
  Se algo "some", confira se passou por `comConta(contaId, ...)`.
- **Key de imagem só o servidor gera**; o validador exige o formato exato. Regex
  frouxa = key aceita que o servidor nunca emitiu.
- **R2 + AWS SDK v3**: checksum CRC32 automático quebra o PUT no R2. Já resolvido em
  `r2/r2.ts` (`WHEN_REQUIRED` + `unsignableHeaders`). Não reintroduzir `cache-control`
  assinado no presign (quebra o preflight CORS).
- **1 máquina no Fly**: presença/tempo real é em memória por máquina; escalar horizontal
  quebra sem um backplane.
- **CRLF (Windows)**: o repo tem `core.autocrlf=true`; alguns arquivos aparecem como
  "modificados" no `git status` só por fim de linha (diff de conteúdo vazio). Commite
  só o que tem diff real.
- **Backend só redeploya** quando muda `backend/**`/`shared/**`/Dockerfile/fly.toml
  (paths do workflow). Mudança só de frontend não sobe o Fly (e não precisa).
- **`null` nos valores** = limpar o campo (o PATCH é merge). Sem `null`, limpar
  número/data/seleção era descartado pelo JSON e o valor antigo voltava.

---

## 13. Glossário (PT no código → conceito)

| Código (PT) | Significado |
|---|---|
| `colecao` | planilha |
| `campo` | bloco do registro (coluna/atributo) |
| `registro` | linha/cartão |
| `secao` / `subcampo` | grupo repetível de campos por linha |
| `valores` | mapa `campoId -> valor` do registro |
| `corpo próprio` (`registros.campos`) | estrutura de blocos independente da coleção |
| `conta` | tenant/workspace |
| `usuario` | pessoa que loga (papel dono/membro) |
| `integracao` | união de planilhas por referência |
| `lixeira` | soft-delete (registros e coleções) |
| `key` | caminho do objeto no R2 (`<colecao>/<registro>/<nano>.<ext>`) |
| `cheia` / `mini` | derivadas de imagem (2560px / 240px) |
| `comConta` | abre transação + fixa `app.conta_id` (RLS) |

---

*Última revisão desta documentação: gerada a partir do código atual (migrations
001–018, Fastify 5 backend, React 18 + Vite frontend). Ao evoluir o sistema, atualize
as seções de banco (§6), API (§9) e formatos (§11).*
