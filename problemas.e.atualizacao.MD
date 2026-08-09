# Problemas e atualizações — plano de trabalho

> Organizei o seu pedido em tópicos para ficar claro o que vou fazer. O **texto
> original** está preservado no final do arquivo.

## Parte 1 — BUGS a corrigir (prioridade máxima)

1. **Editar blocos / valores não salva** (principalmente em planilhas
   integradas "Oficina"). Ao alterar um bloco, copiar um registro em branco e
   editar, ou editar um registro, a alteração não persiste.
   - Causa A: ao **limpar** um campo (número/data/seleção), o app manda "vazio"
     de um jeito que o servidor ignora → o valor antigo volta.
   - Causa B: no editor unido da Oficina, o formulário de cada planilha não se
     re-sincroniza depois de salvar os blocos → o autosave seguinte devolve
     valores velhos.
   - Causa C: quando um registro tem estrutura própria, editar pela tabela usava
     os blocos da coleção (ids errados) → o servidor rejeitava em silêncio.
   - Causa D: erros de salvamento eram engolidos sem avisar → parecia que salvou.

2. **Títulos com nomes/caracteres estranhos** ao criar/editar registros.
   - Causa A: bloco "Preferência" era confundido com "Referência".
   - Causa B: no modo "Geral" da Oficina, o título mostrava chave interna
     (`Ref. sep:<código>:<código>`).

3. **Impossível renomear registros de planilhas integradas (Oficina)**.
   - Causa: o "Renomear" só aparecia quando a referência era texto; nas Oficinas
     a referência costuma ser número → o botão sumia.

4. **Criar registro (com outro corpo) não salva em planilhas integradas**.
   - Causa: mesma da Causa B/valores defasados; o servidor rejeitava por conter
     ids de blocos que não existem mais.

5. **Reordenar registros** na ordem em que aparecem. (Precisa de mudança maior —
   ver "Decisões pendentes".)

6. **Reordenar as planilhas dentro de uma integração** (uma em cima, outra
   embaixo). O servidor já aceita; falta o botão na tela de Integrações.

## Parte 2 — NOVAS FUNCIONALIDADES

7. **Botão "Importar" de fotos por nome de arquivo.**
   - `4621.png/.jpg/.jpeg` → entra no bloco de imagens da referência 4621.
   - `cor.vermelho.jpg` → entra no bloco chamado "COR", no lugar "vermelho".
   - Se o registro não tiver bloco de cor, a foto de cor é ignorada.

8. **Importar arquivo (texto + imagens) que cria registros automaticamente**, na
   ordem escrita, em cartões separados. Pede o nome da planilha antes de aceitar
   o arquivo.

## Decisões (confirmadas com você)

- **Item 5 (reordenar registros):** botões de subir/descer. Exigiu uma coluna
  nova no banco (`ordem`); a migração roda sozinha no deploy.
- **Item 7 (fotos):** `5485.png` → bloco de imagens da referência; `cor.vermelho.png`
  → bloco "Cor" (cria o título da cor se faltar; se o registro NÃO tem bloco de
  cor, não entra). Botão "Importar fotos" na planilha (distribui pela referência
  do nome) e dentro do registro aberto (a cor não precisa da referência no nome).
- **Item 8 (arquivo):** `.zip` com um `.txt`/`.md` + as imagens. Pede o nome da
  planilha antes; separa registros por linha `---`; anexa imagens pelo nome
  citado no texto (ou `![](nome.jpg)`), na ordem.

## Status — TUDO CONCLUÍDO

- [x] 1. Salvamento de blocos/valores (Oficina e normal)
- [x] 2. Títulos estranhos
- [x] 3. Renomear em Oficina (inclui referência por número)
- [x] 4. Criar registro com outro corpo em Oficina
- [x] 6. Reordenar planilhas da integração (setas ↑/↓ em Integrações)
- [x] 5. Reordenar registros (setas ↑/↓ na lista e na tabela)
- [x] 7. Importar fotos por nome (botão "Importar fotos")
- [x] 8. Importar planilha de um `.zip` (botão "Importar de arquivo" na Home)
- [x] 9. "Criação automático": colar TEXTO + imagens do celular (botão na Home).
      Cada nota vira um registro; fotos com referência no nome (ex.: `4578foto.jpg`)
      vão para o registro certo; fotos do celular sem nome ficam embaixo.

Reconhecimento de referência ficou "inteligente" em TODA importação: o código do
começo do nome vale mesmo com lixo depois (`4578sdskmdkm.png` → registro 4578).
O teto de fotos por bloco subiu de 10 para 30.

Verificado: `npm run typecheck`, `npm run build` e testes das funções de
importação (19/19) passam. A migração `018_registros_ordem.sql` roda
automaticamente no deploy (Dockerfile).

---

## Texto original (preservado)

boa noite, estou com bugs sérios no projeto, ao editar blocos de registro, ou copiar registro para vir em branco e editar os blocos, nao esta sendo possivel aterar, ele nao salva o estado novo de alteração, e ao editar blocos de registros ele não salva também sendo bem desagradavel o uso, o app esta rapido o que é exelente, e ao criar, editar registros blocos, etc.. estão vindo com nomes e caracteres estranhos no app como titulo do registro, e é impossivel editar renomear os registros de planilhas integradas de Oficina, estes problemas estão acontecendo em planilhas interagadas "Oficina"  E O erro quando criamos um novo registro em outras planilhas, com outro corpo ele não salva em planilhas integradas, e quero que seja possivel alterar a ordem dos registros na ordem que são exibidas, quero poder alterar as planilhas integradas, deixando planilha em baixo e outra em cima,

passo 2: crie uma logica onde quando eu jogar arquivos "fotos com titulo da referencia exemplo: titulo da imagem: 4621.png ou .jpg ou .jpeg independente do arquivo a logica precisa entender e jogar as imagens no bloco com nome de imagens da referencia / e para imagens com nome de cor.preto.png, cor.amarelo.jpg, cor.vermelho.jpeg qualquer arquivo, precisa cair no bloco com nome de COR, CLARO se na planilha dentro dos registros não existir blocos com nome de cor, naõ entra, se exsitir entra, na ordem do seu nome, registro 4577 haver area com nom de COR com titulo vermelho, a foto com nome de cor.vermelho entra no campo com nome certo e assim por diante, crie um botão com nome de importar

4.depois crie uma logica que ao escrever texto em blocos de notas com imagem na sua ordem certinha, e jogar este arquivo dentro do aplicativo, ele cria automaticamente registros na ordem em que foi escrito as informações com imagens, o bloco pode vir sem titulo, com cards separados para vermos na previa tudo organizado respeitando sua ordem, a planilha deve pedir nome antes de aceitar o arquivo, para ser criada, e aceita o arquivo,
