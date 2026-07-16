import type { Tx } from '../db/comConta';
import type { Campo, ConfigCampo, Registro, TipoCampo } from '../../../shared/tipos';
import { schemaDeValores } from '../validacao/valores';

interface LinhaRegistro {
  id: string;
  colecao_id: string;
  valores: Record<string, unknown> | null;
  criado_em: Date;
  atualizado_em: Date;
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

function mapRegistro(r: LinhaRegistro): Registro {
  return {
    id: r.id,
    colecaoId: r.colecao_id,
    valores: r.valores ?? {},
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
    select id, colecao_id, valores, criado_em, atualizado_em from registros where id = ${id}`;
  return linhas[0] ?? null;
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
          select id, colecao_id, valores, criado_em, atualizado_em
          from registros where colecao_id = ${colecaoId}
          order by criado_em desc limit ${LIMITE}`
      : await tx<LinhaRegistro[]>`
          select id, colecao_id, valores, criado_em, atualizado_em
          from registros where colecao_id = ${colecaoId} and criado_em < ${before}
          order by criado_em desc limit ${LIMITE}`;

  return linhas.map(mapRegistro);
}

export async function criarRegistro(
  tx: Tx,
  colecaoId: string,
  valoresBrutos: unknown,
): Promise<Registro | null> {
  if (!(await colecaoExiste(tx, colecaoId))) return null;

  const campos = await camposDaColecao(tx, colecaoId);
  const valores = schemaDeValores(campos).parse(valoresBrutos);

  const linhas = await tx<LinhaRegistro[]>`
    insert into registros (colecao_id, valores, criado_por)
    values (${colecaoId}, ${tx.json(valores)}, 'dono')
    returning id, colecao_id, valores, criado_em, atualizado_em`;
  const linha = linhas[0];
  if (linha === undefined) throw new Error('insert de registro não retornou linha');
  return mapRegistro(linha);
}

// PATCH é MERGE (`valores || $novo`), não replace: preencher um campo não apaga os
// outros (ver seção 5). Retorna null quando o registro não é do dono → 404.
export async function editarRegistro(
  tx: Tx,
  id: string,
  patchBrutos: unknown,
): Promise<Registro | null> {
  const atual = await lerRegistro(tx, id);
  if (atual === null) return null;

  const campos = await camposDaColecao(tx, atual.colecao_id);
  const patch = schemaDeValores(campos).parse(patchBrutos);

  const linhas = await tx<LinhaRegistro[]>`
    update registros set valores = valores || ${tx.json(patch)}, atualizado_em = now()
    where id = ${id}
    returning id, colecao_id, valores, criado_em, atualizado_em`;
  const linha = linhas[0];
  return linha === undefined ? null : mapRegistro(linha);
}

export async function apagarRegistro(tx: Tx, id: string): Promise<boolean> {
  const linhas = await tx<{ id: string }[]>`delete from registros where id = ${id} returning id`;
  return linhas.length > 0;
}
