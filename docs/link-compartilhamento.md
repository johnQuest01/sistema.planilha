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

No modo **Compartilhar** de um registro há dois caminhos:

1. **Enviar imagem** — gera um "print" único (bom quando o destinatário só quer ver
   uma imagem pronta). Passa por "Preparar imagem" → "Enviar".
2. **Enviar link** — gera um link `/r/<token>` só com os blocos marcados e abre o
   compartilhamento na hora (mais rápido e em qualidade máxima). Se o menu de
   compartilhar não abrir, o link é **copiado** para você colar no WhatsApp.

## Segurança do link

- O link **é o segredo**: qualquer pessoa com o link consegue ver os blocos
  compartilhados daquele registro (mesmo sem login). Só compartilhe com quem deve ver.
- Funciona **mesmo em planilhas com senha** — quem gera o link já tem acesso, e o
  link passa a valer como a "chave" daquela visualização.
- O token é **assinado** (HMAC-SHA256); ninguém consegue adivinhar/forjar um link
  para outro registro ou trocar quais blocos aparecem.
- As imagens já ficam num bucket de leitura pública (por URL), então o link não muda
  nada nesse ponto.

## Prazo de validade (você, Bruno, define)

O prazo é controlado por **variável de ambiente no backend (Render)**:

| Variável | O que faz | Padrão |
| --- | --- | --- |
| `LINK_PUBLICO_DIAS` | Dias até o link **expirar**. `0` = **nunca expira**. | `30` |
| `LINK_PUBLICO_SEGREDO` | Segredo que **assina** os links. | usa o `COOKIE_SECRET` |

Onde mudar: **Render → serviço do backend → Environment → Environment Variables**.
Depois de salvar, o Render **reinicia** o serviço e o novo prazo passa a valer para os
**links gerados a partir daí** (os antigos mantêm a validade que tinham quando foram
criados, porque a data de expiração fica gravada dentro do próprio token).

### Exemplos

- Links válidos por 7 dias: `LINK_PUBLICO_DIAS = 7`
- Links que nunca expiram: `LINK_PUBLICO_DIAS = 0`
- Links válidos por 90 dias: `LINK_PUBLICO_DIAS = 90`

## Revogar links

Como o link é **stateless** (não há registro no banco para cada link), a revogação é feita assim:

- **Revogar TODOS os links de uma vez:** troque o `LINK_PUBLICO_SEGREDO` no Render por
  um valor novo. Todos os links já enviados param de funcionar imediatamente
  (passam a dar "link inválido ou expirado"). Novos links continuam funcionando
  normalmente.
- **Expiração automática por tempo:** definida por `LINK_PUBLICO_DIAS` (acima).
- **Revogar UM link específico:** não é possível hoje (exigiria guardar cada link no
  banco). Se você precisar disso no futuro, dá para evoluir para links salvos/gerenciáveis
  (com botão de "revogar" por link) — é só pedir.

## Detalhes técnicos (referência)

- Backend
  - Config: `backend/src/config.ts` (`linkPublicoDias`, `linkPublicoSegredo`).
  - Token assinado: `backend/src/publico/link.ts`.
  - Rotas: `backend/src/rotas/publico.ts`
    - `POST /api/registros/:id/link` (autenticado) — gera o token dos blocos marcados.
    - `GET /api/publico/r/:token` (público) — devolve só os blocos escolhidos.
- Frontend
  - Página pública: `frontend/src/publico/RegistroPublico.tsx` (rota `/r/:token`).
  - Botão "Enviar link": `frontend/src/preencher/RegistroPreview.tsx`.
