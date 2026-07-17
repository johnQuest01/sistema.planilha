import type { Tx } from '../db/comConta';
import type { Campo, ConfigCampo, Registro, TipoCampo } from '../../../shared/tipos';
import { schemaDeValores } from '../validacao/valores';
import { marcarLixo } from './lixo';

interface LinhaRegistro {
  id: string;
  colecao_id: string;
  valores: Record<string, unknown> | null;
  criado_por: string | null;
  criado_por_id: string | null;
  criado_em: Date;
  atualizado_em: Date;
}

// Quem está agindo, para atribuição e permissão.
export interface Ator {
  id: string;
  nome: string;
  papel: 'dono' | 'membro';
}

interface LinhaCampo {
  id: string;
  colecao_id: string;
  nome: string;
  tipo: string;
  ordem: number;
  config: ConfigCampo | null;
}

const LIMITE = 50; // por página (ver seção 5)
const LIMITE_BUSCA = 20;

function nomeEhReferencia(nome: string): boolean {
  const n = nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  return n.includes('referencia');
}

function escolherCampoReferencia(campos: Campo[]): Campo | undefined {
  const marcado = campos.find(
    (c) => (c.tipo === 'texto' || c.tipo === 'paragrafo') && nomeEhReferencia(c.nome),
  );
  if (marcado !== undefined) return marcado;
  return campos.find((c) => c.tipo === 'texto' || c.tipo === 'paragrafo');
}

function mapRegistro(r: LinhaRegistro): Registro {
  return {
    id: r.id,
    colecaoId: r.colecao_id,
    valores: r.valores ?? {},
    criadoPor: r.criado_por,
    criadoPorId: r.criado_por_id,
    criadoEm: r.criado_em.toISOString(),
    atualizadoEm: r.atualizado_em.toISOString(),
  };
}

function mapCampo(r: LinhaCampo): Campo {
  return {
    id: r.id,
    colecaoId: r.colecao_id,
    nome: r.nome,
    tipo: r.tipo as TipoCampo, // validado pelo CHECK da tabela
    ordem: r.ordem,
    config: r.config ?? {},
  };
}

async function colecaoExiste(tx: Tx, colecaoId: string): Promise<boolean> {
  const linhas = await tx<{ id: string }[]>`select id from colecoes where id = ${colecaoId}`;
  return linhas.length > 0;
}

// Campos da coleção, carregados na MESMA transação em que os valores são validados
// e gravados (ver seção 5): o schema tem que refletir a estrutura vigente.
async function camposDaColecao(tx: Tx, colecaoId: string): Promise<Campo[]> {
  const linhas = await tx<LinhaCampo[]>`
    select id, colecao_id, nome, tipo, ordem, config
    from campos where colecao_id = ${colecaoId}
    order by ordem, criado_em`;
  return linhas.map(mapCampo);
}

async function lerRegistro(tx: Tx, id: string): Promise<LinhaRegistro | null> {
  const linhas = await tx<LinhaRegistro[]>`
    select id, colecao_id, valores, criado_por, criado_por_id, criado_em, atualizado_em
    from registros where id = ${id}`;
  return linhas[0] ?? null;
}

// Só o colecao_id do registro (respeitando RLS). Usado pela rota de upload pra montar
// a key <colecao>/<registro>/<nano>. Null quando não é do dono → 404.
export async function obterColecaoIdDoRegistro(tx: Tx, id: string): Promise<string | null> {
  const linha = await lerRegistro(tx, id);
  return linha?.colecao_id ?? null;
}

// Keys de imagem guardadas em `valores` para um campo. Robusto a valor ausente/torto.
function keysDeImagem(valores: Record<string, unknown>, campoId: string): string[] {
  const v = valores[campoId];
  if (!Array.isArray(v)) return [];
  return v.filter((k): k is string => typeof k === 'string');
}

// Retorna null quando a coleção não é do dono (RLS não deixou enxergar) → 404.
// Paginação por cursor: `before` é o criado_em do último item da página anterior.
export async function listarRegistros(
  tx: Tx,
  colecaoId: string,
  before: string | undefined,
): Promise<Registro[] | null> {
  if (!(await colecaoExiste(tx, colecaoId))) return null;

  const linhas =
    before === undefined
      ? await tx<LinhaRegistro[]>`
          select id, colecao_id, valores, criado_por, criado_por_id, criado_em, atualizado_em
          from registros where colecao_id = ${colecaoId}
          order by criado_em desc limit ${LIMITE}`
      : await tx<LinhaRegistro[]>`
          select id, colecao_id, valores, criado_por, criado_por_id, criado_em, atualizado_em
          from registros where colecao_id = ${colecaoId} and criado_em < ${before}
          order by criado_em desc limit ${LIMITE}`;

  return linhas.map(mapRegistro);
}

// Busca parcial no campo de referência (nome "Referência" ou 1º texto/parágrafo).
export async function buscarRegistros(
  tx: Tx,
  colecaoId: string,
  termo: string,
): Promise<Registro[] | null> {
  if (!(await colecaoExiste(tx, colecaoId))) return null;

  const termoLimpo = termo.trim();
  if (termoLimpo === '') return [];

  const campos = await camposDaColecao(tx, colecaoId);
  const ref = escolherCampoReferencia(campos);
  if (ref === undefined) return [];

  const padrao = `%${termoLimpo}%`;
  const linhas = await tx<LinhaRegistro[]>`
    select id, colecao_id, valores, criado_por, criado_por_id, criado_em, atualizado_em
    from registros
    where colecao_id = ${colecaoId}
      and valores->>${ref.id} ilike ${padrao}
    order by criado_em desc
    limit ${LIMITE_BUSCA}`;

  return linhas.map(mapRegistro);
}

export async function criarRegistro(
  tx: Tx,
  colecaoId: string,
  valoresBrutos: Record<string, unknown>,
  ator: Ator,
): Promise<Registro | null> {
  if (!(await colecaoExiste(tx, colecaoId))) return null;

  const campos = await camposDaColecao(tx, colecaoId);
  const valores = schemaDeValores(campos).parse(valoresBrutos);

  const linhas = await tx<LinhaRegistro[]>`
    insert into registros (colecao_id, valores, criado_por, criado_por_id)
    values (${colecaoId}, ${tx.json(valores)}, ${ator.nome}, ${ator.id})
    returning id, colecao_id, valores, criado_por, criado_por_id, criado_em, atualizado_em`;
  const linha = linhas[0];
  if (linha === undefined) throw new Error('insert de registro não retornou linha');
  return mapRegistro(linha);
}

// PATCH é MERGE (`valores || $novo`), não replace: preencher um campo não apaga os
// outros (ver seção 5). Retorna null quando o registro não é do dono → 404.
export async function editarRegistro(
  tx: Tx,
  id: string,
  patchBrutos: Record<string, unknown>,
): Promise<Registro | null> {
  const atual = await lerRegistro(tx, id);
  if (atual === null) return null;

  const campos = await camposDaColecao(tx, atual.colecao_id);
  const patch = schemaDeValores(campos).parse(patchBrutos);
  const antes = atual.valores ?? {};

  // Toda key de imagem que o patch tira do array vira órfã no R2 (ver 6.4). Grava-se
  // a intenção em lixo_r2 na MESMA transação; a limpeza do bucket é o limpar-r2.
  const removidas: string[] = [];
  for (const c of campos) {
    if (c.tipo !== 'imagem' || !(c.id in patchBrutos)) continue;
    const novas = keysDeImagem(patchBrutos, c.id);
    for (const k of keysDeImagem(antes, c.id)) {
      if (!novas.includes(k)) removidas.push(k);
    }
  }

  const linhas = await tx<LinhaRegistro[]>`
    update registros set valores = valores || ${tx.json(patch)}, atualizado_em = now()
    where id = ${id}
    returning id, colecao_id, valores, criado_por, criado_por_id, criado_em, atualizado_em`;
  const linha = linhas[0];
  if (linha === undefined) return null;

  await marcarLixo(tx, removidas, 'patch-removeu-foto');
  return mapRegistro(linha);
}

// Apagar o registro órfã todas as suas fotos (ver 6.4): senão os objetos ficariam no
// bucket pra sempre, sem key que aponte pra eles. Só o dono ou quem criou pode apagar.
export type ResultadoApagar = 'ok' | 'nao-encontrado' | 'proibido';

export async function apagarRegistro(tx: Tx, id: string, ator: Ator): Promise<ResultadoApagar> {
  const atual = await lerRegistro(tx, id);
  if (atual === null) return 'nao-encontrado';

  const ehDono = ator.papel === 'dono';
  const ehCriador = atual.criado_por_id === ator.id;
  if (!ehDono && !ehCriador) return 'proibido';

  const campos = await camposDaColecao(tx, atual.colecao_id);
  const valores = atual.valores ?? {};
  const orfas = campos
    .filter((c) => c.tipo === 'imagem')
    .flatMap((c) => keysDeImagem(valores, c.id));

  await tx`delete from registros where id = ${id}`;
  await marcarLixo(tx, orfas, 'registro-apagado');
  return 'ok';
}
