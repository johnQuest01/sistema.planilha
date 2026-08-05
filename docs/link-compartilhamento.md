# Link de compartilhamento de registro

Documento para o admin (**Bruno**) sobre como funciona o **link público** de um registro
e onde **definir o prazo** e **revogar** os links.

## O que o link mostra

- O link mostra **apenas os blocos que você marcou** ao compartilhar.
  - Se você marcar **tudo**, o link mostra **tudo**.
  - Se marcar só alguns (ex.: só "Cor" e "Foto"), o link mostra **só esses**.
- A ordem de exibição é **a mesma da prévia do registro** (de cima para baixo:
  bloco → foto → bloco → foto …). Em blocos de seção, cada linha aparece com o
  texto e, logo abaixo, as fotos **daquela** linha (ex.: `Cor: preto` + foto,
  `Cor: vermelho` + foto).
- As **fotos aparecem em qualidade máxima** (resolução original), diferente do
  compartilhamento por imagem (que gera um "print" único).
- A página é **somente leitura**: quem abre o link **não** consegue editar nada, e
  **não** precisa fazer login.

## Como usar (no app)

No modo **Compartilhar** de um registro:

1. **Compartilhar link** (principal) — gera um link **curto** `/r/<codigo>` só com os
   blocos marcados e abre o compartilhamento na hora (rápido e em qualidade máxima).
   Se o menu de compartilhar não abrir, o link é **copiado** para você colar no WhatsApp.
2. **Enviar como imagem** (secundário) — gera um "print" único (quando o destinatário
   só quer uma imagem pronta). Passa por "Enviar como imagem" → "Enviar imagem".

## Segurança do link

- O link **é o segredo**: qualquer pessoa com o link consegue ver os blocos
  compartilhados daquele registro (mesmo sem login). Só compartilhe com quem deve ver.
- Funciona **mesmo em planilhas com senha** — quem gera o link já tem acesso, e o
  link passa a valer como a "chave" daquela visualização.
- O `codigo` é **curto e aleatório** (não sequencial, ~9 caracteres de um alfabeto sem
  letras/números ambíguos) e fica guardado no banco. É impossível adivinhar; e os
  dados reais do registro seguem protegidos pela RLS por conta.
- As imagens já ficam num bucket de leitura pública (por URL), então o link não muda
  nada nesse ponto.
- Links **antigos** (formato `/r/<token>` assinado) continuam abrindo normalmente.

## Prazo de validade (você, Bruno, define)

O prazo é controlado por **variável de ambiente no backend (Render)**:

| Variável | O que faz | Padrão |
| --- | --- | --- |
| `LINK_PUBLICO_DIAS` | Dias até o link **expirar**. `0` = **nunca expira**. | `30` |
| `LINK_PUBLICO_SEGREDO` | Segredo dos links **antigos** (formato token assinado). | usa o `COOKIE_SECRET` |

Onde mudar: **Render → serviço do backend → Environment → Environment Variables**.
Depois de salvar, o Render **reinicia** o serviço e o novo prazo passa a valer para os
**links gerados a partir daí** (os antigos mantêm a validade que tinham quando foram
criados — a data de expiração fica gravada na linha do link, em `compartilhamentos.expira_em`).

### Exemplos

- Links válidos por 7 dias: `LINK_PUBLICO_DIAS = 7`
- Links que nunca expiram: `LINK_PUBLICO_DIAS = 0`
- Links válidos por 90 dias: `LINK_PUBLICO_DIAS = 90`

## Revogar links

Agora cada link vira uma **linha na tabela `compartilhamentos`** (código curto), então:

- **Revogar UM link específico:** já é possível — a rota `DELETE /api/registros/:id/link/:codigo`
  marca `revogado_em` e o link passa a dar "link inválido ou expirado". (Falta só um
  botão na UI para acionar isso — é só pedir.)
- **Expiração automática por tempo:** definida por `LINK_PUBLICO_DIAS` (acima), gravada
  em `expira_em` no momento em que o link é criado.
- **Revogar TODOS de um registro:** apagar/expirar as linhas daquele `registro_id`.
- **Links antigos (token assinado):** ainda dá para revogar todos de uma vez trocando
  o `LINK_PUBLICO_SEGREDO` no Render.

## Detalhes técnicos (referência)

- Backend
  - Config: `backend/src/config.ts` (`linkPublicoDias`, `linkPublicoSegredo`).
  - Tabela do link curto: `backend/migrations/015_compartilhamentos.sql` (código, conta,
    registro, blocos, `expira_em`, `revogado_em`). RLS: leitura pública por código,
    escrita só da conta dona.
  - Repositório: `backend/src/repositorios/compartilhamentos.ts` (gera código, cria, lê, revoga).
  - Token assinado antigo (compat): `backend/src/publico/link.ts`.
  - Rotas: `backend/src/rotas/publico.ts`
    - `POST /api/registros/:id/link` (autenticado) — cria o link curto dos blocos marcados → `{ codigo }`.
    - `DELETE /api/registros/:id/link/:codigo` (autenticado) — revoga um link.
    - `GET /api/publico/r/:codigo` (público) — devolve só os blocos escolhidos (aceita o código curto e o token antigo).
- Frontend
  - Página pública: `frontend/src/publico/RegistroPublico.tsx` (rota `/r/:token`).
  - Botão "Compartilhar link": `frontend/src/preencher/RegistroPreview.tsx`.
