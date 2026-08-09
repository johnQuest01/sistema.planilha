// "Criação automático": cria uma planilha a partir de TEXTO colado (copia e cola)
// e, opcionalmente, de imagens do celular. Cada registro nasce com BLOCOS internos
// (no formato das planilhas Modelagem/Caderno), para as informações ficarem
// separadas em "cards" fáceis de ler.
//
// Como o texto vira blocos:
//   - Registros são separados por uma linha só com "---". SEM "---", todo o texto
//     é UM registro só (linhas em branco NÃO criam registro novo).
//   - Dentro de um registro, cada PONTO FINAL (.) inicia um bloco novo; quebras de
//     linha também separam. (Pontos entre dígitos, ex.: "19.90", não separam.)
//   - "cor: rosa" vira um bloco de COR (a foto de cor entra logo abaixo).
//   - "referência 4785" / "4785 bory" vira o bloco de Referência (título).
//   - "rótulo: valor" vira um bloco de texto com esse rótulo.
//   - Qualquer outra frase vira um bloco de Texto.
//
// Como as imagens entram (pelo NOME do arquivo):
//   - "4785.png" / "4785qualquercoisa.png" -> bloco "Imagens" do registro 4785.
//   - "cor.vermelho.png" / "vermelho.png" / "4785.cor.vermelho.png" -> bloco "Cor",
//     na cor "vermelho" (o nome que entra é "vermelho", nunca "cor.vermelho").
//   - Com um registro só, todas as fotos vão para ele.
import type { Campo, Colecao, Registro, SubCampo } from '../../../shared/tipos';
import { api } from '../api/cliente';
import {
  ehCorConhecida,
  importarNoRegistro,
  parseNomeArquivo,
  refDoNome,
  type NomeArquivo,
} from './importarFotos';
import { codigoInicial } from '../integracao/merge';

const MAX_FOTOS = 30;

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function stemDoNome(nome: string): string {
  return (nome.split(/[/\\]/).pop() ?? nome).replace(/\.[^.]+$/, '').trim();
}

function capitalizar(s: string): string {
  const t = s.trim().slice(0, 60);
  return t.length === 0 ? t : t.charAt(0).toUpperCase() + t.slice(1);
}

function dedupe(list: string[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const n = normalizar(s);
    if (n !== '' && !vistos.has(n)) {
      vistos.add(n);
      out.push(s.trim());
    }
  }
  return out;
}

// Cor detectada SÓ pelo nome do arquivo (sem contexto do registro): cor explícita
// ("cor.X") ou sufixo que é cor conhecida ("4785.vermelho"). É o que decide se o
// registro ganha uma seção "Cor".
function corDeNome(p: NomeArquivo): string | null {
  if (p.cor !== null) return p.cor;
  if (p.sufixo !== null && ehCorConhecida(p.sufixo)) return p.sufixo;
  return null;
}

// ---------------------------------------------------------------------------
// Parse do texto colado
// ---------------------------------------------------------------------------

// Divide o texto em REGISTROS: só uma linha com "---" separa. Sem "---", tudo é um
// registro só (era a divisão por linha em branco que criava "vários registros" sem
// querer).
export function partirEmRegistros(texto: string): string[] {
  const normal = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normal
    .split(/\n[ \t]*-{3,}[ \t]*\n/)
    .map((n) => n.trim())
    .filter((n) => n !== '');
}

// Divide um registro em BLOCOS: cada ponto final (.) fecha um bloco; quebras de
// linha também. Não quebra em ponto entre dígitos (decimais/horas: "19.90", "10.30").
export function partirEmBlocos(texto: string): string[] {
  const s = texto.replace(/\r\n?/g, '\n');
  const blocos: string[] = [];
  let atual = '';
  const fechar = (): void => {
    const t = atual.trim();
    if (t !== '') blocos.push(t);
    atual = '';
  };
  for (let i = 0; i < s.length; i += 1) {
    const ch = s.charAt(i);
    if (ch === '\n') {
      fechar();
      continue;
    }
    if (ch === '.') {
      const ant = s.charAt(i - 1);
      const prox = s.charAt(i + 1);
      if (/\d/.test(ant) && /\d/.test(prox)) {
        atual += ch; // decimal/hora: mantém junto
        continue;
      }
      fechar();
      continue;
    }
    atual += ch;
  }
  fechar();
  return blocos;
}

// Tira a numeração de listas ("1 ...", "2) ...", "3. ..."). Só age quando REALMENTE
// parece uma lista numerada (2+ itens), para não estragar textos que começam com
// número (ex.: "100 metros"). Cobre dois jeitos de escrever:
//   A) "1 conteudo" (numero + espaco): tira o "1 " de cada bloco.
//   B) "1. conteudo" (o ponto separou o numero do conteudo em blocos diferentes):
//      remove os blocos que ficaram só com o número.
export function removerOrdinais(blocos: string[]): string[] {
  const inline = blocos.filter((b) => /^\s*\d{1,2}[.)\-]?\s+\S/.test(b)).length;
  const soltos = blocos.filter((b) => /^\s*\d{1,2}\s*$/.test(b)).length;
  if (inline >= 2) {
    return blocos
      .map((b) => b.replace(/^\s*\d{1,2}[.)\-]?\s+/, '').trim())
      .filter((b) => b !== '');
  }
  if (soltos >= 2) {
    return blocos.filter((b) => !/^\s*\d{1,2}\s*$/.test(b));
  }
  return blocos;
}

type Classe = 'referencia' | 'cor' | 'rotulo' | 'texto' | 'imagemref';

export interface BlocoInfo {
  classe: Classe;
  rotulo: string | null;
  valor: string;
  cores: string[];
}

/** Tipo de bloco que o estoque cria no registro. */
export type TipoEstoque = 'imagem' | 'texto' | 'cor' | 'referencia';

export interface EntradaEstoque {
  /** Como a pessoa escreve (sem acento, minúsculo). */
  chaves: string[];
  /** Título que aparece no registro. */
  titulo: string;
  tipo: TipoEstoque;
  /** Texto curto pro cartão de ajuda na UI. */
  dica: string;
}

// Estoque: nome escrito no texto → bloco que nasce no registro.
// Ampliar esta lista deixa a criação automática mais “inteligente” sem NLP.
export const ESTOQUE_BLOCOS: EntradaEstoque[] = [
  {
    chaves: [
      'imagem', 'imagens', 'foto', 'fotos',
      'imagem da referencia', 'imagens da referencia',
      'foto da referencia', 'fotos da referencia',
      'imagem de referencia', 'imagens de referencia',
      'foto de referencia', 'fotos de referencia',
    ],
    titulo: 'Imagem da referência',
    tipo: 'imagem',
    dica: 'bloco de fotos da referência',
  },
  {
    chaves: ['modelagem', 'imagem da modelagem', 'fotos da modelagem', 'foto da modelagem'],
    titulo: 'Modelagem',
    tipo: 'imagem',
    dica: 'bloco de fotos chamado Modelagem',
  },
  {
    chaves: ['caderno', 'foto do caderno', 'fotos do caderno'],
    titulo: 'Caderno',
    tipo: 'imagem',
    dica: 'bloco de fotos chamado Caderno',
  },
  {
    chaves: ['oficina', 'foto da oficina', 'fotos da oficina'],
    titulo: 'Oficina',
    tipo: 'imagem',
    dica: 'bloco de fotos chamado Oficina',
  },
  {
    chaves: ['cor', 'cores'],
    titulo: 'Cor',
    tipo: 'cor',
    dica: 'use “cor: rosa” (com o nome da cor)',
  },
  {
    chaves: ['referencia', 'ref', 'ref.'],
    titulo: 'Referência',
    tipo: 'referencia',
    dica: 'use “ref: 4785” ou só o código',
  },
  {
    chaves: ['observacao', 'observacoes', 'obs'],
    titulo: 'Observação',
    tipo: 'texto',
    dica: 'bloco de texto (pode ficar vazio)',
  },
  {
    chaves: ['tecido', 'tecidos'],
    titulo: 'Tecido',
    tipo: 'texto',
    dica: 'bloco de texto “Tecido”',
  },
  {
    chaves: ['tamanho', 'tamanhos'],
    titulo: 'Tamanho',
    tipo: 'texto',
    dica: 'bloco de texto “Tamanho”',
  },
  {
    chaves: ['descricao', 'detalhe', 'detalhes', 'nota', 'notas'],
    titulo: 'Descrição',
    tipo: 'texto',
    dica: 'bloco de texto livre',
  },
];

const MAPA_ESTOQUE = new Map<string, EntradaEstoque>();
for (const e of ESTOQUE_BLOCOS) {
  for (const k of e.chaves) MAPA_ESTOQUE.set(k, e);
}

/** Linhas para a UI: o que escrever → o que aparece no registro. */
export function linhasEstoqueAjuda(): { escreve: string; vira: string }[] {
  return [
    { escreve: '4785 ou ref: 4785', vira: 'bloco Referência' },
    { escreve: 'cor: rosa', vira: 'bloco Cor (rosa)' },
    { escreve: 'modelagem', vira: 'bloco de fotos Modelagem' },
    { escreve: 'imagem da referência', vira: 'bloco de fotos da referência' },
    { escreve: 'observação:', vira: 'bloco Observação (vazio)' },
    { escreve: 'tecido: algodão', vira: 'bloco Tecido com texto' },
    { escreve: 'qualquer frase.', vira: 'bloco Texto' },
  ];
}

// "cor: rosa" / "cor rosa" / "cores: rosa, azul" (o \b evita casar "corte"/"corpo").
const RE_COR = /^\s*cor(?:es)?\b\s*[:\-]?\s*(.+)$/i;
// "ref: 4785" / "referência 4785" / "ref. 4785" (o \b evita casar "referente").
const RE_REF_EXPL = /^\s*ref(?:er[eê]ncia)?\b\.?\s*[:\-]?\s*(\S.*)$/i;
// Bloco que começa com um código (>= 3 dígitos): "4785", "4785 bory flaxh".
const RE_REF_CODE = /^\s*\d{3,}[a-z0-9]*(?:\s+.+)?$/i;
// "rótulo: valor" — só com dois-pontos (hífen picotaria palavras compostas). O valor
// pode ser VAZIO: "observação:" vira um bloco chamado "Observação" em branco.
const RE_ROTULO = /^\s*([\p{L}][\p{L}\s]{0,28}?)\s*:\s*(.*)$/u;

function separarCores(txt: string): string[] {
  return txt
    .split(/\s*(?:,|;|\/|\be\b)\s*/i)
    .map((c) => c.trim())
    .filter((c) => c !== '');
}

function doEstoque(chave: string): EntradaEstoque | undefined {
  return MAPA_ESTOQUE.get(normalizar(chave));
}

export function classificarBloco(bloco: string): BlocoInfo {
  const b = bloco.trim();
  const mCor = b.match(RE_COR);
  if (mCor?.[1] !== undefined) {
    return { classe: 'cor', rotulo: 'Cor', valor: mCor[1].trim(), cores: separarCores(mCor[1]) };
  }
  const mRef = b.match(RE_REF_EXPL);
  if (mRef?.[1] !== undefined) {
    return { classe: 'referencia', rotulo: 'Referência', valor: mRef[1].trim(), cores: [] };
  }
  if (RE_REF_CODE.test(b)) {
    return { classe: 'referencia', rotulo: 'Referência', valor: b, cores: [] };
  }

  // Nome sozinho do estoque (ex.: "modelagem", "observação", "tecido").
  const soNome = doEstoque(b);
  if (soNome !== undefined) {
    if (soNome.tipo === 'imagem') {
      return { classe: 'imagemref', rotulo: soNome.titulo, valor: b, cores: [] };
    }
    if (soNome.tipo === 'texto') {
      return { classe: 'rotulo', rotulo: soNome.titulo, valor: '', cores: [] };
    }
    if (soNome.tipo === 'cor') {
      return { classe: 'cor', rotulo: 'Cor', valor: '', cores: [] };
    }
    if (soNome.tipo === 'referencia') {
      return { classe: 'referencia', rotulo: 'Referência', valor: '', cores: [] };
    }
  }

  // "rótulo: valor" -> bloco NOMEADO pelo rótulo (o valor é o texto do campo e pode
  // ser vazio: "observação:" nasce como bloco "Observação" em branco pra preencher).
  const mRot = b.match(RE_ROTULO);
  if (mRot?.[1] !== undefined && mRot[1].trim() !== '') {
    const rot = mRot[1].trim();
    const valor = (mRot[2] ?? '').trim();
    const est = doEstoque(rot);
    if (est?.tipo === 'imagem') {
      return { classe: 'imagemref', rotulo: est.titulo, valor: rot, cores: [] };
    }
    if (est?.tipo === 'cor' && valor !== '') {
      return { classe: 'cor', rotulo: 'Cor', valor, cores: separarCores(valor) };
    }
    return {
      classe: 'rotulo',
      rotulo: est?.titulo ?? capitalizar(rot),
      valor,
      cores: [],
    };
  }
  return { classe: 'texto', rotulo: null, valor: b, cores: [] };
}

interface RegistroParse {
  blocos: BlocoInfo[];
  referencia: string | null;
  coresTexto: string[];
  textoNorm: string;
}

function parseRegistro(raw: string): RegistroParse {
  const blocos = removerOrdinais(partirEmBlocos(raw)).map(classificarBloco);
  const refBloco = blocos.find((b) => b.classe === 'referencia');
  const coresTexto = blocos.filter((b) => b.classe === 'cor').flatMap((b) => b.cores);
  return {
    blocos,
    referencia: refBloco?.valor ?? null,
    coresTexto,
    textoNorm: normalizar(raw),
  };
}

// ---------------------------------------------------------------------------
// Distribuição das imagens pelos registros (por nome de arquivo)
// ---------------------------------------------------------------------------

export interface RotaImagem {
  idx: number; // índice do registro que recebe a imagem
  casou: boolean; // true = casou por referência/cor/menção; false = fallback
}

// Decide, só pelos nomes, para qual registro cada imagem vai: por referência no
// nome, senão por cor mencionada no texto, senão por menção do nome; por fim, o 1º
// (registro único = sempre ele).
export function planejarRegistroDasImagens(
  parses: Pick<RegistroParse, 'referencia' | 'coresTexto' | 'textoNorm'>[],
  nomes: string[],
): RotaImagem[] {
  return nomes.map((nome) => {
    const code = refDoNome(nome);
    if (code !== null) {
      const alvo = codigoInicial(code);
      const i = parses.findIndex(
        (p) => p.referencia !== null && codigoInicial(p.referencia) === alvo,
      );
      if (i >= 0) return { idx: i, casou: true };
    }
    const cor = corDeNome(parseNomeArquivo(nome));
    if (cor !== null) {
      const alvo = normalizar(cor);
      const i = parses.findIndex((p) => p.coresTexto.some((c) => normalizar(c) === alvo));
      if (i >= 0) return { idx: i, casou: true };
    }
    const stem = normalizar(stemDoNome(nome));
    if (stem.length >= 2) {
      const i = parses.findIndex((p) => p.textoNorm.includes(stem));
      if (i >= 0) return { idx: i, casou: true };
    }
    if (parses.length === 1) return { idx: 0, casou: true };
    return { idx: 0, casou: false };
  });
}

// ---------------------------------------------------------------------------
// Esquema compartilhado + corpo próprio de cada registro
// ---------------------------------------------------------------------------

export interface EsquemaComum {
  ref: Campo;
  cor: Campo;
  img: Campo;
  subCorId: string;
  subFotoId: string;
}

// Cria os blocos compartilhados da coleção (Referência, Cor, Imagens). Os mesmos
// ids são reusados no corpo de cada registro, então a tabela do desktop mostra as
// colunas e cada registro mantém a estrutura própria (com os blocos de texto).
async function criarEsquemaComum(colecaoId: string): Promise<EsquemaComum> {
  const subCorId = crypto.randomUUID();
  const subFotoId = crypto.randomUUID();
  const ref = await api.criarCampo(colecaoId, { nome: 'Referência', tipo: 'texto' });
  const cor = await api.criarCampo(colecaoId, {
    nome: 'Cor',
    tipo: 'secao',
    config: {
      subcampos: [
        { id: subCorId, nome: 'Cor', tipo: 'texto', config: {} },
        { id: subFotoId, nome: 'Fotos', tipo: 'imagem', config: { maxFotos: MAX_FOTOS } },
      ] as SubCampo[],
    },
  });
  const img = await api.criarCampo(colecaoId, {
    nome: 'Imagem da referência',
    tipo: 'imagem',
    config: { maxFotos: MAX_FOTOS },
  });
  return { ref, cor, img, subCorId, subFotoId };
}

// Monta o corpo próprio (blocos, na ordem do texto) + os valores iniciais de UM
// registro. Reusa os campos compartilhados para Referência/Cor/Imagens.
export function montarCorpo(
  comuns: EsquemaComum,
  blocos: BlocoInfo[],
  coresDeImagens: string[],
  temImagensRef: boolean,
): { campos: Campo[]; valores: Record<string, unknown> } {
  const campos: Campo[] = [];
  const valores: Record<string, unknown> = {};
  const colId = comuns.ref.colecaoId;
  let ordem = 0;
  const add = (c: Campo): void => {
    campos.push({ ...c, ordem });
    ordem += 100;
  };
  const addTexto = (nome: string, valor: string): void => {
    const tipo: Campo['tipo'] = valor.length > 80 || valor.includes('\n') ? 'paragrafo' : 'texto';
    add({ id: crypto.randomUUID(), colecaoId: colId, nome: nome.slice(0, 60) || 'Texto', tipo, ordem: 0, config: {} });
    if (valor !== '') valores[campos[campos.length - 1]!.id] = valor; // bloco "titulado" nasce vazio
  };

  let refFeita = false;
  let corFeita = false;
  const coresTexto: string[] = [];
  const temImgPadrao = (): boolean => campos.some((c) => c.id === comuns.img.id);
  const temImgComNome = (nome: string): boolean =>
    campos.some((c) => c.tipo === 'imagem' && normalizar(c.nome) === normalizar(nome));
  const addImgPadrao = (): void => {
    if (!temImgPadrao()) add({ ...comuns.img });
  };
  const addImgNomeada = (nome: string): void => {
    const titulo = nome.trim() || 'Imagem da referência';
    if (normalizar(titulo) === normalizar(comuns.img.nome)) {
      addImgPadrao();
      return;
    }
    if (temImgComNome(titulo)) return;
    add({
      id: crypto.randomUUID(),
      colecaoId: colId,
      nome: titulo.slice(0, 60),
      tipo: 'imagem',
      ordem: 0,
      config: { maxFotos: MAX_FOTOS },
    });
  };
  const addCor = (): void => {
    if (!corFeita) {
      add({ ...comuns.cor });
      corFeita = true;
    }
  };
  // Quando o usuário DECLARA o bloco de imagem no texto (ex.: "5 imagem da
  // referencia"), respeitamos a posição dele — não injetamos o bloco logo após a
  // referência.
  const temDeclaracaoImg = blocos.some((b) => b.classe === 'imagemref');

  for (const b of blocos) {
    if (b.classe === 'referencia') {
      if (!refFeita) {
        add({ ...comuns.ref });
        if (b.valor !== '') valores[comuns.ref.id] = b.valor;
        refFeita = true;
        if (temImagensRef && !temDeclaracaoImg) addImgPadrao(); // fotos ficam logo abaixo do título
      } else {
        addTexto('Referência', b.valor); // 2ª referência vira só texto
      }
      continue;
    }
    if (b.classe === 'imagemref') {
      addImgNomeada(b.rotulo ?? 'Imagem da referência');
      continue;
    }
    if (b.classe === 'cor') {
      addCor();
      for (const c of b.cores) if (c.trim() !== '') coresTexto.push(c.trim());
      continue;
    }
    if (b.classe === 'rotulo') {
      addTexto(b.rotulo ?? 'Texto', b.valor);
      continue;
    }
    addTexto('Texto', b.valor);
  }

  // Fotos de cor sem "cor:" no texto: garante a seção mesmo assim.
  if (coresDeImagens.length > 0) addCor();
  // Fotos de referência sem bloco de referência escrito: cria o "Imagens" no fim.
  if (temImagensRef) addImgPadrao();

  // Preenche as linhas da seção Cor com as cores do TEXTO (o "título" da cor
  // aparece mesmo antes de anexar a foto).
  if (corFeita && coresTexto.length > 0) {
    valores[comuns.cor.id] = dedupe(coresTexto).map((cor) => ({ [comuns.subCorId]: cor }));
  }

  return { campos, valores };
}

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------

export interface ProgressoAuto {
  fase: 'criando' | 'imagens';
  feito: number;
  total: number;
}

export interface RelatorioAuto {
  registros: number;
  fotos: number;
  semReferencia: number; // fotos que não casaram (foram para o 1º registro)
  excedente: number; // fotos que passaram do limite do bloco ou sem bloco de destino
  erros: number; // fotos que falharam no upload (formato/rede)
}

export async function criarPlanilhaAutomatica(
  nome: string,
  texto: string,
  imagens: File[],
  aoProgresso?: (p: ProgressoAuto) => void,
): Promise<{ colecaoId: string; relatorio: RelatorioAuto }> {
  const brutos = partirEmRegistros(texto);
  if (brutos.length === 0) throw new Error('Cole algum texto para criar os registros.');

  const parses = brutos.map(parseRegistro);

  // Roteia cada imagem para um registro e descobre, por registro, as cores vindas
  // de imagem e se há foto de referência (para montar os blocos certos).
  const rota = planejarRegistroDasImagens(parses, imagens.map((f) => f.name));
  const coresPorReg: string[][] = parses.map(() => []);
  const temRefImgPorReg: boolean[] = parses.map(() => false);
  const arquivosPorReg: File[][] = parses.map(() => []);
  imagens.forEach((f, i) => {
    const idx = rota[i]?.idx ?? 0;
    arquivosPorReg[idx]!.push(f);
    const cor = corDeNome(parseNomeArquivo(f.name));
    if (cor !== null) coresPorReg[idx]!.push(cor);
    else temRefImgPorReg[idx] = true;
  });

  aoProgresso?.({ fase: 'criando', feito: 0, total: parses.length });
  const col = await api.criarColecao(nome);
  const comuns = await criarEsquemaComum(col.id);
  const colecaoStub: Colecao = {
    id: col.id,
    nome: col.nome,
    criadoPor: null,
    campos: [comuns.ref, comuns.cor, comuns.img],
    protegida: false,
    bloqueada: false,
    arquivada: false,
  };

  // Cria em ordem INVERSA para o 1º registro escrito ficar no topo (lista = ordem desc).
  const registros: Registro[] = new Array<Registro>(parses.length);
  for (let i = parses.length - 1; i >= 0; i -= 1) {
    const p = parses[i]!;
    const { campos, valores } = montarCorpo(
      comuns,
      p.blocos,
      dedupe(coresPorReg[i]!),
      temRefImgPorReg[i]! || p.referencia !== null,
    );
    registros[i] = await api.criarRegistro(col.id, valores, campos);
    aoProgresso?.({ fase: 'criando', feito: parses.length - i, total: parses.length });
  }

  // Anexa as imagens registro a registro, reusando a lógica de importação (que já
  // distribui foto de referência x foto de cor pelos blocos certos).
  let fotos = 0;
  let excedente = 0;
  let erros = 0;
  const semReferencia = rota.filter((r) => !r.casou).length;
  const total = imagens.length;
  let feito = 0;
  aoProgresso?.({ fase: 'imagens', feito, total });
  for (let i = 0; i < registros.length; i += 1) {
    const arqs = arquivosPorReg[i]!;
    const reg = registros[i];
    if (arqs.length === 0 || reg === undefined) continue;
    try {
      const { registro, relatorio } = await importarNoRegistro(colecaoStub, reg, arqs, () => {
        feito += 1;
        aoProgresso?.({ fase: 'imagens', feito, total });
      });
      registros[i] = registro;
      fotos += relatorio.refOk + relatorio.corOk;
      excedente += relatorio.cheios.length + relatorio.semBloco.length;
      erros += relatorio.erros.length;
    } catch {
      // Um registro inteiro falhou no upload: conta as fotos dele como erro e segue.
      erros += arqs.length;
    }
  }

  return {
    colecaoId: col.id,
    relatorio: { registros: parses.length, fotos, semReferencia, excedente, erros },
  };
}

export function resumoAuto(rel: RelatorioAuto): string {
  const partes = [`${rel.registros} registro(s)`];
  if (rel.fotos > 0) partes.push(`${rel.fotos} foto(s)`);
  let base = `Criado: ${partes.join(', ')}.`;
  const avisos: string[] = [];
  if (rel.semReferencia > 0) avisos.push(`${rel.semReferencia} foto(s) sem referência foram para o 1º registro`);
  if (rel.excedente > 0) avisos.push(`${rel.excedente} foto(s) não couberam no bloco`);
  if (rel.erros > 0) avisos.push(`${rel.erros} foto(s) falharam ao enviar`);
  if (avisos.length > 0) base += ` (${avisos.join('; ')})`;
  return base;
}
