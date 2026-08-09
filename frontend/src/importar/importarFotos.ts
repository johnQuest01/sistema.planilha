// Importa fotos distribuindo-as automaticamente pelos blocos certos, a partir do
// NOME do arquivo:
//   - "4621.png" / "4621.jpg" ... -> bloco de imagens da referência 4621.
//   - "cor.vermelho.png"          -> bloco "Cor" do registro, linha/título "vermelho".
//   - "4621.cor.vermelho.png"     -> registro 4621, bloco "Cor", "vermelho".
// Regras (conforme combinado):
//   * A foto de cor só entra se o registro TIVER um bloco "Cor". Se não tiver, não entra.
//   * Dentro do bloco "Cor", se a cor (ex.: "amarelo") ainda não existir, cria a
//     linha/título automaticamente; se já existir, anexa a foto naquela linha.
import { api } from '../api/cliente';
import { enviarFoto } from '../imagens/enviar';
import type { Campo, Colecao, Registro, SubCampo } from '../../../shared/tipos';
import { camposDoRegistro } from '../preencher/derivarResumo';
import { chaveReferencia, codigoInicial } from '../integracao/merge';

const PAGINA = 20;

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase();
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
  cor: string | null;
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

// Interpreta o nome do arquivo (sem extensão), separando por ".".
export function parseNomeArquivo(nome: string): NomeArquivo {
  const semExt = soNome(nome).replace(/\.[^.]+$/, '');
  const tokens = semExt.split('.').map((t) => t.trim()).filter((t) => t !== '');
  const idxCor = tokens.findIndex((t) => normalizar(t) === 'cor');
  const antes = (idxCor >= 0 ? tokens.slice(0, idxCor) : tokens).join(' ').trim();
  const cor = idxCor >= 0 ? tokens.slice(idxCor + 1).join(' ').trim() : '';
  // Referência = código numérico do começo (tolerante a lixo); sem ele, o texto
  // antes de "cor" (para referências não numéricas).
  const referencia = refDoNome(semExt) ?? (antes === '' ? null : antes);
  return { referencia, cor: cor === '' ? null : cor };
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

interface SecaoCor {
  secao: Campo;
  subCor: SubCampo | null; // subcampo de texto/seleção com o NOME da cor
  subFoto: SubCampo; // subcampo de imagem
}

// Seção "Cor" do registro: precisa ter um subcampo de imagem. O subcampo de
// texto/seleção (se houver) guarda o nome da cor (o "título").
function secaoCor(campos: Campo[]): SecaoCor | null {
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
  const secCor = secaoCor(campos);

  for (const file of arquivos) {
    const { cor } = parseNomeArquivo(file.name);
    try {
      if (cor !== null) {
        const colocou = await colocarCor(registro.id, file, cor, campos, secCor, valores, rel);
        if (colocou) rel.corOk += 1;
      } else {
        const colocou = await colocarRef(registro.id, file, blocoRef, valores, rel);
        if (colocou) rel.refOk += 1;
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
  let cursor: number | undefined;
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
    cursor = ultimo.ordem;
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
