// Importa fotos distribuindo-as automaticamente pelos blocos certos, a partir do
// NOME do arquivo. Reconhece:
//   - "4621.png"                  -> bloco de imagens da referência 4621.
//   - "cor.vermelho.png"          -> bloco "Cor" do registro, cor "vermelho".
//   - "4621.cor.vermelho.png"     -> registro 4621, bloco "Cor", "vermelho".
//   - "4784.vermelho.png" / "4874vermelho.png" / "4784vermelho.jpeg"
//       -> registro 4784/4874, bloco "Cor", cor "vermelho" (a cor vem logo após a
//          referência, colada ou separada por . - _).
// Regras:
//   * A cor entra no bloco "Cor" do registro. Se a cor ainda não é uma linha/título,
//     cria automaticamente; se já existe, ANEXA a foto (nunca sobrescreve).
//   * O texto após a referência só é tratado como cor se for uma cor conhecida OU já
//     existir no registro; senão (ex.: "4578sdskmdkm") é foto de referência.
//   * Sem bloco "Cor", a foto vai para o bloco de imagens da referência (não se perde).
import { api, cursorDeRegistro, ErroApi } from '../api/cliente';
import { enviarFoto } from '../imagens/enviar';
import type { Campo, Colecao, Registro, SubCampo } from '../../../shared/tipos';
import { camposDoRegistro } from '../preencher/derivarResumo';
import { chaveReferencia, codigoInicial } from '../integracao/merge';

// Cria um bloco de imagem tentando um teto alto (backend novo aceita até 30) e
// caindo para 10 quando o backend ainda é o antigo (cujo máximo era 10) — sem isso,
// o import falhava com "validação" (400) enquanto o backend não sobe.
export async function criarBlocoImagens(colecaoId: string, nome: string, max = 30): Promise<Campo> {
  try {
    return await api.criarCampo(colecaoId, { nome, tipo: 'imagem', config: { maxFotos: max } });
  } catch (e) {
    if (max > 10 && e instanceof ErroApi && e.status === 400) {
      return api.criarCampo(colecaoId, { nome, tipo: 'imagem', config: { maxFotos: 10 } });
    }
    throw e;
  }
}

const PAGINA = 20;

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase();
}

// Filtro TOLERANTE de imagem: no celular (e com HEIC) o `File.type` costuma vir
// vazio; se filtrássemos só por `type.startsWith('image/')`, essas fotos sumiam
// silenciosamente ("imagem não entra"). Aceita por mime OU por extensão do nome.
export function ehArquivoImagem(f: File): boolean {
  if (f.type.startsWith('image/')) return true;
  if (f.type === '' || f.type === 'application/octet-stream') {
    return /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif|tiff?)$/i.test(f.name);
  }
  return false;
}

// "Cor"/"Cores" como palavra (não casa "corte"/"corpo").
function nomeEhCor(nome: string): boolean {
  return /(?:^|[^a-z])cor(?:es)?(?:[^a-z]|$)/.test(normalizar(nome));
}

// Bloco onde entram as fotos da referência (imagem/modelagem/foto), fora o de cor.
function nomeSugereFotoRef(nome: string): boolean {
  const n = normalizar(nome);
  return (
    /(?:^|[^a-z])referencia/.test(n) ||
    n.includes('modelagem') ||
    n.includes('imagem') ||
    n.includes('foto')
  );
}

export interface NomeArquivo {
  referencia: string | null;
  /** Cor EXPLÍCITA: veio com o marcador "cor" no nome (ex.: cor.vermelho). */
  cor: string | null;
  /** Texto logo após a referência, SEM marcador "cor" (candidato a cor; pode ser
   *  lixo). Ex.: "4874vermelho" -> "vermelho", "4578sdskmdkm" -> "sdskmdkm". */
  sufixo: string | null;
}

// Só o nome do arquivo (sem pasta), útil para .zip com subpastas.
function soNome(nome: string): string {
  return (nome.split(/[/\\]/).pop() ?? nome).trim();
}

// Código de referência a partir do INÍCIO do nome, tolerante a lixo depois:
// "4578.png" -> "4578", "4578sdskmdkm.jpg" -> "4578", "4578-frente.png" -> "4578".
// Sem dígitos no começo (ex.: "IMG_1203.jpg", "cor.vermelho.png") -> null.
export function refDoNome(nome: string): string | null {
  const m = soNome(nome).match(/^\s*(\d{2,})/);
  return m?.[1] ?? null;
}

// Interpreta o nome do arquivo (sem extensão).
export function parseNomeArquivo(nome: string): NomeArquivo {
  const semExt = soNome(nome).replace(/\.[^.]+$/, '');
  const tokens = semExt.split('.').map((t) => t.trim()).filter((t) => t !== '');
  const idxCor = tokens.findIndex((t) => normalizar(t) === 'cor');
  const ref = refDoNome(semExt);

  // Formato explícito com "cor": <ref?>.cor.<cor> (a cor é sempre tratada como cor).
  if (idxCor >= 0) {
    const antes = tokens.slice(0, idxCor).join(' ').trim();
    const cor = tokens.slice(idxCor + 1).join(' ').trim();
    return {
      referencia: ref ?? (antes === '' ? null : antes),
      cor: cor === '' ? null : cor,
      sufixo: null,
    };
  }

  // Começa com a referência (dígitos): o que vem depois é o SUFIXO (candidato a
  // cor), colado ou separado por . - _ — ex.: "4874vermelho" / "4784.vermelho".
  if (ref !== null) {
    const resto = semExt.slice(String(ref).length).replace(/^[\s._-]+/, '').replace(/[\s._-]+$/, '').trim();
    return { referencia: ref, cor: null, sufixo: resto === '' ? null : resto };
  }

  // Sem dígitos no início e sem "cor": se o nome INTEIRO é uma cor conhecida
  // (ex.: "vermelho.png", "rosa.jpeg"), trata como COR — é o que o usuário espera
  // ao renomear a foto só com a cor. Senão, é um nome descritivo (sem cor).
  const antes = tokens.join(' ').trim();
  if (antes !== '' && ehCorConhecida(antes)) {
    return { referencia: null, cor: antes, sufixo: null };
  }
  return { referencia: antes === '' ? null : antes, cor: null, sufixo: null };
}

// Bloco de imagem "de referência" do registro (onde caem as fotos da referência).
function blocoImagemReferencia(campos: Campo[]): Campo | null {
  const preferido = campos.find(
    (c) => c.tipo === 'imagem' && nomeSugereFotoRef(c.nome) && !nomeEhCor(c.nome),
  );
  if (preferido !== undefined) return preferido;
  const qualquer = campos.find((c) => c.tipo === 'imagem' && !nomeEhCor(c.nome));
  return qualquer ?? null;
}

// Casa o NOME do arquivo (com pontos) com o NOME de um bloco de imagem do registro.
// Ex.: "imagem.da.referencia.png" -> bloco "Imagem da referência"; "modelagem.png"
// -> bloco "Modelagem". Um código no início ("4785.imagem.da.referencia.png") é
// referência (roteamento), não parte do nome do campo, então é ignorado aqui.
// Blocos de cor ficam de fora (a foto de cor tem lógica própria).
export function blocoImagemPorNomeArquivo(nome: string, campos: Campo[]): Campo | null {
  const semExt = soNome(nome).replace(/\.[^.]+$/, '');
  const semRef = semExt.replace(/^\s*\d{2,}[\s._-]*/, ''); // tira o código do começo
  const alvo = normalizar(semRef.replace(/[._-]+/g, ' ')).trim();
  if (alvo.length < 3) return null;
  const imagens = campos.filter((c) => c.tipo === 'imagem' && !nomeEhCor(c.nome));
  const exato = imagens.find((c) => normalizar(c.nome) === alvo);
  if (exato !== undefined) return exato;
  return (
    imagens.find((c) => {
      const n = normalizar(c.nome);
      return n.length >= 3 && (alvo.startsWith(`${n} `) || alvo === n);
    }) ?? null
  );
}

// Seção (NÃO-cor) com subcampo de imagem — destino das fotos de referência quando o
// registro guarda a foto DENTRO de uma seção (ex.: "REFERÊNCIA" da Modelagem: número
// + imagem por linha), em vez de num bloco de imagem no topo.
interface SecaoFoto {
  secao: Campo;
  subFoto: SubCampo;
}
export function secaoImagemReferencia(campos: Campo[]): SecaoFoto | null {
  const comImagem = campos.filter(
    (c) =>
      c.tipo === 'secao' &&
      !nomeEhCor(c.nome) &&
      (c.config.subcampos ?? []).some((s) => s.tipo === 'imagem'),
  );
  const pref = comImagem.find((c) => nomeSugereFotoRef(c.nome)) ?? comImagem[0];
  if (pref === undefined) return null;
  const subFoto = (pref.config.subcampos ?? []).find((s) => s.tipo === 'imagem');
  if (subFoto === undefined) return null;
  return { secao: pref, subFoto };
}

export interface SecaoCor {
  secao: Campo;
  subCor: SubCampo | null; // subcampo de texto/seleção com o NOME da cor
  subFoto: SubCampo; // subcampo de imagem
}

// Seção "Cor" do registro: precisa ter um subcampo de imagem. O subcampo de
// texto/seleção (se houver) guarda o nome da cor (o "título").
export function secaoCor(campos: Campo[]): SecaoCor | null {
  for (const c of campos) {
    if (c.tipo !== 'secao' || !nomeEhCor(c.nome)) continue;
    const subs = c.config.subcampos ?? [];
    const subFoto = subs.find((s) => s.tipo === 'imagem');
    if (subFoto === undefined) continue;
    const subCor = subs.find((s) => s.tipo === 'texto' || s.tipo === 'selecao') ?? null;
    return { secao: c, subCor, subFoto };
  }
  return null;
}

// Blocos de imagem "por cor" (modelo alternativo): um bloco por cor, com o nome da
// cor no `config.titulo` (ou no próprio nome do bloco). Ex.: bloco "COR" título "vermelho".
function blocoImagemPorCor(campos: Campo[], cor: string): Campo | null {
  const alvo = normalizar(cor);
  return (
    campos.find(
      (c) =>
        c.tipo === 'imagem' &&
        (nomeEhCor(c.nome) || c.config.titulo !== undefined) &&
        (normalizar(c.config.titulo ?? '') === alvo || normalizar(c.nome) === alvo),
    ) ?? null
  );
}

function keysDe(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((k): k is string => typeof k === 'string') : [];
}

function linhasDe(valor: unknown): Record<string, unknown>[] {
  return Array.isArray(valor)
    ? valor.filter((l): l is Record<string, unknown> => typeof l === 'object' && l !== null)
    : [];
}

// Cores comuns (PT-BR) para reconhecer a cor no nome mesmo sem a palavra "cor".
// Um texto que não é cor conhecida (ex.: "sdskmdkm") NÃO vira cor — vira foto de
// referência. Cores fora desta lista funcionam usando "cor." no nome ou quando a
// cor já existe no registro.
const CORES_CONHECIDAS = new Set([
  'vermelho', 'azul', 'verde', 'amarelo', 'preto', 'branco', 'rosa', 'roxo',
  'laranja', 'marrom', 'cinza', 'bege', 'dourado', 'prata', 'prateado', 'vinho',
  'salmao', 'lilas', 'turquesa', 'nude', 'marinho', 'militar', 'caramelo',
  'mostarda', 'coral', 'creme', 'gelo', 'grafite', 'chumbo', 'terracota',
  'magenta', 'ciano', 'violeta', 'indigo', 'ocre', 'jeans', 'denim', 'pink',
  'offwhite', 'cru', 'areia', 'tijolo', 'uva', 'menta', 'pistache', 'lavanda',
  'fucsia', 'champagne', 'champanhe', 'castanho', 'mel', 'cobre', 'bronze',
  'esmeralda', 'safira', 'rubi', 'pessego', 'abobora', 'oliva',
]);

export function ehCorConhecida(texto: string): boolean {
  return CORES_CONHECIDAS.has(normalizar(texto));
}

// A cor já existe no registro? (linha na seção Cor com esse título, ou bloco de
// imagem titulado com essa cor).
function corExistenteNoRegistro(
  suf: string,
  secCor: SecaoCor | null,
  campos: Campo[],
  valores: Record<string, unknown>,
): boolean {
  const alvo = normalizar(suf);
  const subCor = secCor?.subCor ?? null;
  if (secCor !== null && subCor !== null) {
    const linhas = linhasDe(valores[secCor.secao.id]);
    const bate = linhas.some((l) => {
      const v = l[subCor.id];
      return typeof v === 'string' && normalizar(v) === alvo;
    });
    if (bate) return true;
  }
  return blocoImagemPorCor(campos, suf) !== null;
}

// Decide a cor FINAL de uma foto. null = tratar como foto de referência (o texto
// após a referência é "lixo", não uma cor — ex.: "4578sdskmdkm").
export function corDaFoto(
  parse: NomeArquivo,
  secCor: SecaoCor | null,
  campos: Campo[],
  valores: Record<string, unknown>,
): string | null {
  if (parse.cor !== null) return parse.cor; // marcador "cor" explícito
  const suf = parse.sufixo;
  if (suf === null) return null;
  if (corExistenteNoRegistro(suf, secCor, campos, valores)) return suf;
  if (ehCorConhecida(suf)) return suf;
  return null;
}

export interface RelatorioImport {
  refOk: number;
  corOk: number;
  semRegistro: string[]; // arquivos cuja referência não bateu com nenhum registro
  semBloco: string[]; // arquivos sem bloco de destino (ref/cor) no registro
  cheios: string[]; // bloco no limite de fotos (maxFotos)
  erros: string[]; // falhas de upload/salvamento
}

function relatorioVazio(): RelatorioImport {
  return { refOk: 0, corOk: 0, semRegistro: [], semBloco: [], cheios: [], erros: [] };
}

export interface ProgressoImport {
  feito: number;
  total: number;
}

// Importa um conjunto de arquivos NUM registro específico (usado com o registro
// aberto). As fotos de cor não precisam da referência no nome aqui.
export async function importarNoRegistro(
  colecao: Colecao,
  registro: Registro,
  arquivos: File[],
  aoProgresso?: (p: ProgressoImport) => void,
): Promise<{ registro: Registro; relatorio: RelatorioImport }> {
  const rel = relatorioVazio();
  const campos = camposDoRegistro(colecao, registro);
  const valores: Record<string, unknown> = { ...registro.valores };
  const total = arquivos.length;
  let feito = 0;

  const blocoRef = blocoImagemReferencia(campos);
  const secRef = secaoImagemReferencia(campos);
  const secCor = secaoCor(campos);

  for (const file of arquivos) {
    const parse = parseNomeArquivo(file.name);
    const blocoPorNome = blocoImagemPorNomeArquivo(file.name, campos);
    const cor = corDaFoto(parse, secCor, campos, valores);
    const temOndeColocarCor = cor !== null && (secCor !== null || blocoImagemPorCor(campos, cor) !== null);
    try {
      if (blocoPorNome !== null) {
        // O nome do arquivo bate com o nome de um bloco de imagem (ex.:
        // "imagem.da.referencia.png" -> bloco "Imagem da referência").
        if (await colocarRef(registro.id, file, blocoPorNome, valores, rel)) rel.refOk += 1;
      } else if (cor !== null && temOndeColocarCor) {
        if (await colocarCor(registro.id, file, cor, campos, secCor, valores, rel)) rel.corOk += 1;
      } else if (blocoRef !== null) {
        // Foto de referência: bloco de imagem no topo.
        if (await colocarRef(registro.id, file, blocoRef, valores, rel)) rel.refOk += 1;
      } else if (secRef !== null) {
        // Sem bloco no topo: cai na seção de referência (formato Modelagem).
        if (await colocarRefEmSecao(registro.id, file, secRef, valores, rel)) rel.refOk += 1;
      } else {
        rel.semBloco.push(file.name);
      }
    } catch {
      rel.erros.push(file.name);
    }
    feito += 1;
    aoProgresso?.({ feito, total });
  }

  // Um PATCH só com tudo que mudou neste registro.
  let atualizado = registro;
  if (rel.refOk > 0 || rel.corOk > 0) {
    atualizado = await api.editarRegistro(registro.id, valores);
  }
  return { registro: atualizado, relatorio: rel };
}

// Coloca uma foto de referência no bloco de imagens (respeitando maxFotos).
async function colocarRef(
  registroId: string,
  file: File,
  bloco: Campo | null,
  valores: Record<string, unknown>,
  rel: RelatorioImport,
): Promise<boolean> {
  if (bloco === null) {
    rel.semBloco.push(file.name);
    return false;
  }
  const max = bloco.config.maxFotos ?? 1;
  const atuais = keysDe(valores[bloco.id]);
  if (atuais.length >= max) {
    rel.cheios.push(file.name);
    return false;
  }
  const key = await enviarFoto(registroId, file);
  valores[bloco.id] = [...atuais, key];
  return true;
}

// Coloca uma foto de referência DENTRO de uma seção (1ª linha; cria uma se não
// houver). Para registros no formato Modelagem, onde a foto da referência mora numa
// seção (número + imagem) em vez de num bloco de imagem no topo.
async function colocarRefEmSecao(
  registroId: string,
  file: File,
  sec: SecaoFoto,
  valores: Record<string, unknown>,
  rel: RelatorioImport,
): Promise<boolean> {
  const { secao, subFoto } = sec;
  const max = subFoto.config.maxFotos ?? 1;
  const linhas = linhasDe(valores[secao.id]).map((l) => ({ ...l }));
  let linha = linhas[0];
  if (linha === undefined) {
    linha = {};
    linhas.push(linha);
  }
  const atuais = keysDe(linha[subFoto.id]);
  if (atuais.length >= max) {
    rel.cheios.push(file.name);
    return false;
  }
  const key = await enviarFoto(registroId, file);
  linha[subFoto.id] = [...atuais, key];
  valores[secao.id] = linhas;
  return true;
}

// Coloca uma foto de cor: seção "Cor" (linha por cor) ou bloco de imagem titulado.
async function colocarCor(
  registroId: string,
  file: File,
  cor: string,
  campos: Campo[],
  secCor: SecaoCor | null,
  valores: Record<string, unknown>,
  rel: RelatorioImport,
): Promise<boolean> {
  if (secCor !== null) {
    const { secao, subCor, subFoto } = secCor;
    const max = subFoto.config.maxFotos ?? 1;
    const linhas = linhasDe(valores[secao.id]).map((l) => ({ ...l }));
    const alvoCor = normalizar(cor);
    let linha =
      subCor !== null
        ? linhas.find((l) => normalizar(typeof l[subCor.id] === 'string' ? (l[subCor.id] as string) : '') === alvoCor)
        : undefined;
    if (linha === undefined) {
      // Cria o "título" da cor automaticamente (nova linha na seção).
      linha = subCor !== null ? { [subCor.id]: cor } : {};
      linhas.push(linha);
    }
    const atuais = keysDe(linha[subFoto.id]);
    if (atuais.length >= max) {
      rel.cheios.push(file.name);
      return false;
    }
    const key = await enviarFoto(registroId, file);
    linha[subFoto.id] = [...atuais, key];
    valores[secao.id] = linhas;
    return true;
  }

  const bloco = blocoImagemPorCor(campos, cor);
  if (bloco !== null) {
    const max = bloco.config.maxFotos ?? 1;
    const atuais = keysDe(valores[bloco.id]);
    if (atuais.length >= max) {
      rel.cheios.push(file.name);
      return false;
    }
    const key = await enviarFoto(registroId, file);
    valores[bloco.id] = [...atuais, key];
    return true;
  }

  // Registro não tem bloco de cor: não entra (conforme combinado).
  rel.semBloco.push(file.name);
  return false;
}

// Carrega TODOS os registros da coleção, indexando por código de referência.
async function indexarPorReferencia(colecao: Colecao): Promise<Map<string, Registro[]>> {
  const mapa = new Map<string, Registro[]>();
  let cursor: number | string | undefined;
  for (let i = 0; i < 1000; i += 1) {
    const pagina = await api.listarRegistros(colecao.id, cursor);
    for (const r of pagina) {
      const cod = chaveReferencia(camposDoRegistro(colecao, r), r);
      if (cod === null) continue;
      const lista = mapa.get(cod);
      if (lista === undefined) mapa.set(cod, [r]);
      else lista.push(r);
    }
    if (pagina.length < PAGINA) break;
    const ultimo = pagina[pagina.length - 1];
    if (ultimo === undefined) break;
    const proximo = cursorDeRegistro(ultimo);
    if (proximo === cursor) break; // cursor não avançou: evita loop
    cursor = proximo;
  }
  return mapa;
}

// Importa em LOTE numa coleção inteira: distribui cada arquivo para o registro cuja
// referência bate com o nome do arquivo. Fotos de cor sem referência no nome (ex.:
// "cor.vermelho.png") não têm como achar o registro no lote → entram em `semRegistro`.
export async function importarNaColecao(
  colecao: Colecao,
  arquivos: File[],
  aoProgresso?: (p: ProgressoImport) => void,
): Promise<{ atualizados: Registro[]; relatorio: RelatorioImport }> {
  const rel = relatorioVazio();
  const indice = await indexarPorReferencia(colecao);

  // Agrupa os arquivos por registro de destino (para um PATCH por registro).
  const porRegistro = new Map<string, { registro: Registro; arquivos: File[] }>();
  for (const file of arquivos) {
    const { referencia } = parseNomeArquivo(file.name);
    if (referencia === null) {
      rel.semRegistro.push(file.name);
      continue;
    }
    const alvos = indice.get(codigoInicial(referencia)) ?? [];
    const registro = alvos[0];
    if (registro === undefined) {
      rel.semRegistro.push(file.name);
      continue;
    }
    const grupo = porRegistro.get(registro.id);
    if (grupo === undefined) porRegistro.set(registro.id, { registro, arquivos: [file] });
    else grupo.arquivos.push(file);
  }

  const total = arquivos.length;
  let feito = rel.semRegistro.length;
  aoProgresso?.({ feito, total });

  const atualizados: Registro[] = [];
  for (const { registro, arquivos: doReg } of porRegistro.values()) {
    const r = await importarNoRegistro(colecao, registro, doReg, () => {
      feito += 1;
      aoProgresso?.({ feito, total });
    });
    atualizados.push(r.registro);
    rel.refOk += r.relatorio.refOk;
    rel.corOk += r.relatorio.corOk;
    rel.semBloco.push(...r.relatorio.semBloco);
    rel.cheios.push(...r.relatorio.cheios);
    rel.erros.push(...r.relatorio.erros);
  }

  return { atualizados, relatorio: rel };
}

// Resumo curto do que aconteceu, para mostrar ao usuário.
export function resumoRelatorio(rel: RelatorioImport): string {
  const partes: string[] = [];
  if (rel.refOk > 0) partes.push(`${rel.refOk} foto(s) de referência`);
  if (rel.corOk > 0) partes.push(`${rel.corOk} foto(s) de cor`);
  const base = partes.length > 0 ? `Importado: ${partes.join(' e ')}.` : 'Nenhuma foto importada.';
  const avisos: string[] = [];
  if (rel.semRegistro.length > 0) avisos.push(`${rel.semRegistro.length} sem registro correspondente`);
  if (rel.semBloco.length > 0) avisos.push(`${rel.semBloco.length} sem bloco de destino`);
  if (rel.cheios.length > 0) avisos.push(`${rel.cheios.length} com bloco cheio`);
  if (rel.erros.length > 0) avisos.push(`${rel.erros.length} com erro`);
  return avisos.length > 0 ? `${base} (${avisos.join('; ')})` : base;
}
