import type { Tx } from '../db/comConta';
import type { Campo, Colecao, ConfigCampo, TipoCampo } from '../../../shared/tipos';

export interface ColecaoResumo {
  id: string;
  nome: string;
  criadoEm: string;
  atualizadoEm: string;
}

interface LinhaColecao {
  id: string;
  nome: string;
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

function mapColecao(r: LinhaColecao): ColecaoResumo {
  return {
    id: r.id,
    nome: r.nome,
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

export async function criarColecao(tx: Tx, contaId: string, nome: string): Promise<ColecaoResumo> {
  const linhas = await tx<LinhaColecao[]>`
    insert into colecoes (conta_id, nome) values (${contaId}, ${nome})
    returning id, nome, criado_em, atualizado_em`;
  const linha = linhas[0];
  if (linha === undefined) throw new Error('insert de coleção não retornou linha');
  return mapColecao(linha);
}

export async function listarColecoes(tx: Tx, contaId: string): Promise<ColecaoResumo[]> {
  const linhas = await tx<LinhaColecao[]>`
    select id, nome, criado_em, atualizado_em
    from colecoes where conta_id = ${contaId}
    order by criado_em desc`;
  return linhas.map(mapColecao);
}

export async function obterColecao(tx: Tx, id: string): Promise<Colecao | null> {
  const cols = await tx<{ id: string; nome: string }[]>`
    select id, nome from colecoes where id = ${id}`;
  const col = cols[0];
  if (col === undefined) return null;

  const campos = await tx<LinhaCampo[]>`
    select id, colecao_id, nome, tipo, ordem, config
    from campos where colecao_id = ${id}
    order by ordem, criado_em`;

  return { id: col.id, nome: col.nome, campos: campos.map(mapCampo) };
}

export async function renomearColecao(
  tx: Tx,
  id: string,
  nome: string,
): Promise<ColecaoResumo | null> {
  const linhas = await tx<LinhaColecao[]>`
    update colecoes set nome = ${nome}, atualizado_em = now()
    where id = ${id}
    returning id, nome, criado_em, atualizado_em`;
  const linha = linhas[0];
  return linha === undefined ? null : mapColecao(linha);
}

export async function apagarColecao(tx: Tx, id: string): Promise<boolean> {
  const linhas = await tx<{ id: string }[]>`delete from colecoes where id = ${id} returning id`;
  return linhas.length > 0;
}
