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
  return comDigito ?? tokens[0] ?? '';
}

// Chave de junção de um registro: o CÓDIGO INICIAL do primeiro bloco de referência
// preenchido; se não houver, cai no código inicial do título. null = não dá para
// unir. Casa quando o código inicial é igual (ex.: 4871).
export function chaveReferencia(campos: Campo[], registro: Registro): string | null {
  for (const c of camposReferencia(campos)) {
    const cod = codigoInicial(formatarValor(c, registro.valores[c.id]));
    if (cod !== '') return cod;
  }
  // Sem bloco de referência preenchido: tenta o título BRUTO. Se for vazio ou
  // "Sem nome", o registro NÃO tem referência -> null (vira "solto", aparece
  // sozinho em "Geral"). Antes reduzíamos o título com codigoInicial ANTES de
  // checar: "Sem nome" virava "sem" e escapava do guard, colapsando todos os
  // registros vazios num só grupo "sem" (escondia os demais).
  const tituloBruto = tituloDoRegistro(campos, registro).trim().toLowerCase();
  if (tituloBruto === '' || tituloBruto === 'sem nome') return null;
  const cod = codigoInicial(tituloBruto);
  return cod === '' ? null : cod;
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
