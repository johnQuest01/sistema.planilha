# Deploy — Vercel + Render + Neon + R2

Fluxo (seção 7): o **binário nunca toca o Render**. Sobe do browser direto pro R2
via presigned PUT e desce do CDN da Cloudflare direto pro browser. O Render só vê
JSON — por isso o `bodyLimit: 64 KB` do `server.ts` está certo e não deve crescer.

```
celular/desktop → VERCEL (React, CDN) --rewrite /api/*--> RENDER (Fastify, só JSON)
                                                              ├── SQL ──> NEON (Postgres + RLS)
                                                              └── presign PUT ──> R2 (mídia)
browser --PUT direto--> R2        R2 --GET público via CDN--> browser
```

Os arquivos de infra deste repo:
- `frontend/vercel.json` — proxy `/api/*` e fallback de SPA (troque `REPLACE-RENDER-HOST`).
- `render.yaml` — blueprint do backend (troque `REPLACE-APP` / `REPLACE-DOMINIO`; segredos entram no painel).
- `backend/.env.example` — todas as env vars documentadas.

> Placeholders a trocar antes de subir: `REPLACE-RENDER-HOST.onrender.com`,
> `REPLACE-APP.vercel.app`, `midia.REPLACE-DOMINIO`.

---

## 1. Neon (7.6) — duas connection strings, não intercambiáveis

| String | Host | Onde usar |
|---|---|---|
| **Pooled** | `...-pooler.<região>.aws.neon.tech` | app → `DATABASE_URL` |
| **Direct** | `....<região>.aws.neon.tech` | migrations → `DATABASE_URL_DIRECT` |

`?sslmode=require` nas duas. `run.ts` já lê `DATABASE_URL_DIRECT ?? DATABASE_URL`.
`comConta` usa `set_config(..., true)` (local à transação) — é o que torna a RLS
compatível com o PgBouncer da pooled. **Não troque por `SET SESSION` nem `..., false`**:
o valor sobreviveria à devolução da conexão e vazaria conta entre requisições.

Scale-to-zero do free tier: 1ª query depois de ocioso paga o religamento (soma com o
cold start do Render). Ou tier pago, ou saiba que o 1º acesso do dia é lento. Sem ping.

---

## 2. R2 (7.1 / 7.2) — bucket dedicado

Crie **`mostruario-midia`** (novo). **Não reutilize o bucket de mídia do outro projeto
do dono**: as miniaturas precisam ser públicas, e abrir um bucket com mídia de clientes
de outro produto expõe aquela mídia ao mundo.

Token de API: **Object Read & Write escopado só a este bucket** (nunca conta/Admin).

**a) CORS no bucket** (painel, não código):
```json
[{
  "AllowedOrigins": ["https://REPLACE-APP.vercel.app"],
  "AllowedMethods": ["PUT", "GET"],
  "AllowedHeaders": ["Content-Type"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3600
}]
```

**b) Leitura pública:** use **domínio customizado** (`midia.<dominio>`) via CDN da
Cloudflare — não o `r2.dev` (rate-limitado, "dev only"). Essa base é `R2_PUBLIC_BASE`.

**c) Público é público:** a key é a única proteção. Ela é gerada **pelo servidor** com
`nanoid(21)` no caminho `<uuid-coleção>/<uuid-registro>/<nano>` (inadivinhável), e a
regex do validador exige exatamente essa forma. Nunca afrouxe a regex.

### Upload (Fase 5, já implementado no backend)

- `POST /api/registros/:id/upload` `{ mime, tamanhoCheia, tamanhoMini }` → `{ key, urlCheia, urlMini }`
  (dois presigned PUT de 60 s; ContentLength assinado limita a 2 MB cheia / 200 KB mini).
- Fluxo do cliente: cria o registro → sobe as duas derivadas nas URLs → faz o PATCH com a `key`.
- Órfãos: PATCH que remove key, apagar registro e apagar campo-imagem gravam em `lixo_r2`.
  Limpeza manual: `npm run limpar-r2 -w backend` (apaga do bucket o que está lá há +7 dias).
- **Falta a parte de frontend** (canvas que gera as 2 derivadas, visor com scroll-snap,
  grade de edição) — depende da UI da Fase 4.

---

## 3. Render (7.4)

Use `render.yaml` (Blueprint) ou configure à mão:

| Config | Valor |
|---|---|
| Runtime | Node 20 |
| Root directory | raiz do repo (workspace npm) |
| Build | `npm ci --include=dev && npm run build -w backend` (NODE_ENV=production omite devDeps; sem `--include=dev` o build usa um tsc global e quebra) |
| Start | `npm run start -w backend` (cwd=backend; `node dist/...` da raiz não acha o arquivo) |
| Health check | `/health` |

Segredos no painel: `DATABASE_URL` (pooled), `DATABASE_URL_DIRECT` (direct),
`COOKIE_SECRET`, `R2_ACCOUNT_ID/ACCESS_KEY_ID/SECRET_ACCESS_KEY`. Não-segredos:
`NODE_ENV=production`, `CORS_ORIGIN`, `R2_BUCKET`, `R2_PUBLIC_BASE`.

Sem `COOKIE_SECRET`, o processo **não sobe** — comportamento desejado (2.5.2).

---

## 4. Vercel (7.5)

| Config | Valor |
|---|---|
| Framework | Vite |
| Root directory | `frontend` |
| Build | `npm run build` |
| Output | `dist` |
| Install | `npm install --prefix ../` |

**Sem `VITE_API_URL`** — o rewrite de `vercel.json` faz tudo relativo.

### Por que o rewrite (7.3) — bug garantido no 1º deploy

`onrender.com` e `vercel.app` são domínios registráveis diferentes → cross-site, e o
cookie é `SameSite=Lax`, que **não vai em `fetch` cross-site**. Sintoma clássico: login
responde 200 com `Set-Cookie` e todo request seguinte volta 401. O proxy por rewrite na
Vercel faz o browser enxergar só `vercel.app` (same-origin) — `Lax` continua valendo,
sem CORS, sem CSRF novo. Quando houver domínio próprio, migre pra `app.` + `api.` com
`Domain=.dominio.com` (7.3b). **Não** use `SameSite=None` sem contramedida de CSRF (7.3c).

---

## 5. Checklist (7.7)

- [ ] Bucket é `mostruario-midia`; o bucket do outro projeto do dono não aparece em nenhum arquivo
- [ ] `DATABASE_URL` tem `-pooler`; `DATABASE_URL_DIRECT` não tem
- [ ] `set_config` em `comConta` com 3º arg `true`; sem `SET SESSION`/`..., false`
- [ ] `npm run migrate` roda pela direct e o app sobe pela pooled
- [ ] Deploy no Render **sem** `COOKIE_SECRET` → processo não sobe
- [ ] Login na Vercel, dar F5, continuar logado (prova o 7.3)
- [ ] Duas contas em browsers diferentes, requisições simultâneas: nenhuma vê a outra (RLS sobrevive ao pooler)
- [ ] F5 direto em `/p/<token>` → carrega o app, não 404 da Vercel
- [ ] Upload pelo celular em 4G → PUT no R2 passa (prova o CORS)
- [ ] Miniatura da lista carrega do `R2_PUBLIC_BASE`, < 30 KB, com cache
- [ ] Nenhum segredo em `git log -p` — só nomes de env var

---

## 6. Estado atual do deploy (valores reais)

Ambiente já provisionado e no ar:

| Peça | URL / valor |
|---|---|
| Frontend (Vercel) | `https://sistema-planilha-backend.vercel.app` |
| Backend (Render)  | `https://mostruario-api.onrender.com` (`/health` ok, `/api/config` ok) |
| Bucket R2         | `mostruario-midia` |
| `R2_PUBLIC_BASE`  | `https://pub-856c1e1b6dc645308495de9e44b391e0.r2.dev` |

O push na `main` dispara auto-deploy nos dois (Render `autoDeploy: true`; Vercel via
integração GitHub).

### 6.1 Ajustes manuais de painel (não dá pra fazer por código)

**a) Render → `R2_PUBLIC_BASE`.** O painel do Render sobrescreve o `render.yaml`; hoje a
variável está com o placeholder `https://midia.REPLACE-DOMINIO`. Troque para
`https://pub-856c1e1b6dc645308495de9e44b391e0.r2.dev`. Sem isso o upload funciona (a foto
vai pro bucket), mas o `<img>` monta a URL errada e não exibe. (Dashboard → serviço
`mostruario-api` → Environment → editar `R2_PUBLIC_BASE` → Save → redeploy.)

**b) Cloudflare R2 → CORS do bucket `mostruario-midia`.** Necessário pro PUT direto do
navegador. A política pronta está em `r2-cors.json` na raiz. Dashboard → R2 → bucket
`mostruario-midia` → **Settings** → **CORS Policy** → **Add/Edit** → colar:

```json
[
  {
    "AllowedOrigins": [
      "https://sistema-planilha-backend.vercel.app",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

`localhost:5173` está incluído pra testar upload em dev. Ao trocar o domínio da Vercel,
adicione o novo em `AllowedOrigins`. O `r2.dev` é "dev only" e rate-limitado — quando
tiver domínio próprio, migre a leitura pra `midia.<dominio>` via CDN (ver seção 2b).
