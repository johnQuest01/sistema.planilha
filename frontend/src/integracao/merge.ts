import type { Campo, Colecao, Integracao, Registro } from '../../../shared/tipos';
import { camposDoRegistro, camposReferencia, formatarValor, tituloDoRegistro } from '../preencher/derivarResumo';

// Uma "parte" da integração: uma coleção do grupo e o registro dela que casou com
// a referência (ou null, quando essa planilha ainda não tem registro pra ela).
export interface ParteIntegrada {
  colecao: Colecao;
  registro: Registro | null;
}

// Um registro "unido": as partes na ORDEM do grupo. `chave` é a referência que
// juntou tudo (ex.: "4871").
export interface RegistroIntegrado {
  chave: string;
  partes: ParteIntegrada[];
}

// Normaliza a referência para comparar: sem acento, minúsculo e com os espaços
// internos colapsados (1 espaço).
function normalizarRef(txt: string): string {
  return txt
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// Tira pontuação das pontas de um pedaço (ex.: "#4871." -> "4871", "(bory)" -> "bory").
function limparToken(t: string): string {
  return t.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '');
}

function textoBruto(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.trunc(v));
  return '';
}

function nomeEhRef(nome: string): boolean {
  const n = nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  // Igual ao importar fotos: "Referência", "Ref." e "Ref" (sem ponto).
  return /(?:^|[^a-z])(?:referencia|ref\.?)/.test(n);
}

function ehCodigoNumerico(c: string): boolean {
  return /^\d{3,6}$/.test(c);
}

/** Primeiro código 3–6 dígitos (4832, 4832macaquinho, "4832 biquíni"). */
function codigoDeTexto(txt: string): string {
  const limpo = normalizarRef(txt);
  if (limpo === '') return '';
  const m = limpo.match(/\d{3,6}/);
  if (m?.[0] !== undefined) return m[0];
  return codigoInicial(txt);
}

// CÓDIGO da referência: o primeiro pedaço que contém dígito (o código costuma ser
// numérico), onde quer que ele esteja. Se nada tiver dígito, usa o primeiro pedaço.
// Assim "4871 bory flaxh", "4871 curto", "bory 4871" e "#4871" casam todos por
// "4871" — código igual, resto (descrição) diferente une do mesmo jeito.
export function codigoInicial(txt: string): string {
  const limpo = normalizarRef(txt);
  if (limpo === '') return '';
  const tokens = limpo.split(' ').map(limparToken).filter((t) => t !== '');
  if (tokens.length === 0) return '';
  const comDigito = tokens.find((t) => /\d/.test(t));
  if (comDigito !== undefined) {
    const m = comDigito.match(/\d{3,6}/);
    if (m?.[0] !== undefined) return m[0];
    return comDigito;
  }
  return tokens[0] ?? '';
}

function linhasDe(valor: unknown): Record<string, unknown>[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((l): l is Record<string, unknown> => typeof l === 'object' && l !== null);
}

/** Todos os códigos de um registro (topo + seção R.Referência + texto começando com código). */
export function codigosDoRegistro(campos: Campo[], registro: Registro): string[] {
  const out: string[] = [];
  const visto = new Set<string>();
  const add = (bruto: string): void => {
    const cod = codigoDeTexto(bruto);
    if (cod === '' || visto.has(cod)) return;
    visto.add(cod);
    out.push(cod);
  };

  for (const c of camposReferencia(campos)) {
    add(formatarValor(c, registro.valores[c.id]));
    add(textoBruto(registro.valores[c.id]));
  }
  for (const c of campos) {
    if (c.tipo === 'secao') {
      const subsRef = (c.config.subcampos ?? []).filter((s) => nomeEhRef(s.nome));
      if (subsRef.length === 0) continue;
      for (const linha of linhasDe(registro.valores[c.id])) {
        for (const s of subsRef) {
          add(textoBruto(linha[s.id]));
          add(formatarValor(s, linha[s.id]));
        }
      }
    }
  }
  // Título (bloco marcado / seção R) entra sempre: no Caderno o código 4832 pode
  // estar no título/foto e um bloco "Referência" só com a descrição ("macaquinho").
  const tituloBruto = tituloDoRegistro(campos, registro).trim();
  if (tituloBruto !== '' && tituloBruto.toLowerCase() !== 'sem nome') add(tituloBruto);

  if (!out.some(ehCodigoNumerico)) {
    for (const c of campos) {
      if (c.tipo !== 'texto' && c.tipo !== 'paragrafo') continue;
      const t = textoBruto(registro.valores[c.id]).trim();
      if (/^\d{3,6}\b/.test(t)) add(t);
    }
  }
  return out;
}

/** Chaves em que o registro entra na planilha unida. Referência única → uma
 *  chave (igual ao comportamento de sempre). Várias linhas em seção R (ex.:
 *  Modelagem com 3 referências) → uma chave por código, para cada uma casar
 *  com o Caderno correspondente. */
export function chavesDeAgrupamento(campos: Campo[], registro: Registro): string[] {
  const todos = codigosDoRegistro(campos, registro);
  const numericos = todos.filter(ehCodigoNumerico);
  if (numericos.length > 0) return numericos;
  return todos[0] !== undefined ? [todos[0]] : [];
}

/** Pedaços do título que pertencem a ESTA chave (cartão 4832 não lista as outras
 *  refs de um registro de Modelagem com 3 linhas). */
export function pecasTituloDaChave(titulo: string, chave: string): string[] {
  const pecas = titulo
    .split(' | ')
    .map((p) => p.trim())
    .filter((p) => p !== '' && p.toLowerCase() !== 'sem nome');
  if (!ehCodigoNumerico(chave)) return pecas;
  const daChave = pecas.filter((p) => {
    const m = p.match(/\d{3,6}/);
    return m?.[0] === chave;
  });
  return daChave.length > 0 ? daChave : pecas;
}

// Chave de junção: prefere o código numérico 3–6 dígitos (4832 no Caderno e na
// Modelagem, mesmo se um lado guarda "4832 macaquinho" ou o código só no título).
export function chaveReferencia(campos: Campo[], registro: Registro): string | null {
  return chavesDeAgrupamento(campos, registro)[0] ?? null;
}

// Campos vigentes de uma parte: os do registro (corpo próprio, se houver) ou, sem
// registro, os da coleção.
export function camposDaParte(parte: ParteIntegrada): Campo[] {
  return parte.registro === null ? parte.colecao.campos : camposDoRegistro(parte.colecao, parte.registro);
}

// Coleção VIRTUAL: os blocos de todas as partes, concatenados na ordem do grupo.
// Como os ids de campo são UUIDs por-coleção (nunca colidem), dá para juntar sem
// conflito. Só existe em memória — o banco nunca é tocado.
export function colecaoVirtual(integracao: Integracao, partes: ParteIntegrada[]): Colecao {
  const campos: Campo[] = [];
  for (const p of partes) campos.push(...camposDaParte(p));
  return {
    id: integracao.id,
    nome: integracao.nome,
    criadoPor: null,
    campos,
    protegida: false,
    bloqueada: false,
    arquivada: false,
  };
}

// Registro VIRTUAL: os valores de todas as partes num mapa só (chaveado por
// Campo.id). `id` é o do primeiro registro real existente — só para ações que o
// preview faz sobre a referência (renomear). `campos` traz o corpo unificado.
export function registroVirtual(partes: ParteIntegrada[]): Registro {
  const valores: Record<string, unknown> = {};
  const campos: Campo[] = [];
  let idBase: string | null = null;
  let colecaoId = '';
  let criadoEm = new Date(0).toISOString();
  let atualizadoEm = new Date(0).toISOString();
  for (const p of partes) {
    campos.push(...camposDaParte(p));
    if (p.registro === null) continue;
    Object.assign(valores, p.registro.valores);
    if (idBase === null) {
      idBase = p.registro.id;
      colecaoId = p.registro.colecaoId;
    }
    if (p.registro.atualizadoEm > atualizadoEm) atualizadoEm = p.registro.atualizadoEm;
    if (criadoEm === new Date(0).toISOString() || p.registro.criadoEm < criadoEm) {
      criadoEm = p.registro.criadoEm;
    }
  }
  return {
    id: idBase ?? 'virtual',
    colecaoId,
    valores,
    campos,
    criadoPor: null,
    criadoPorId: null,
    ordem: 0,
    criadoEm,
    atualizadoEm,
  };
}

// Índice campo.id -> registro real que o possui, para rotear cada edição ao
// registro certo (o editor integrado salva um PATCH por planilha afetada).
export function mapaCampoParaParte(partes: ParteIntegrada[]): Map<string, number> {
  const mapa = new Map<string, number>();
  partes.forEach((p, i) => {
    for (const c of camposDaParte(p)) mapa.set(c.id, i);
  });
  return mapa;
}
