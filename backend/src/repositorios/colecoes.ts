import type { Tx } from '../db/comConta';
import type { Campo, Colecao, ConfigCampo, TipoCampo } from '../../../shared/tipos';

export interface ColecaoResumo {
  id: string;
  nome: string;
  criadoPor: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

interface LinhaColecao {
  id: string;
  nome: string;
  criado_por: string | null;
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
    criadoPor: r.criado_por,
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

export async function criarColecao(
  tx: Tx,
  contaId: string,
  nome: string,
  criadoPor: string,
): Promise<ColecaoResumo> {
  const linhas = await tx<LinhaColecao[]>`
    insert into colecoes (conta_id, nome, criado_por) values (${contaId}, ${nome}, ${criadoPor})
    returning id, nome, criado_por, criado_em, atualizado_em`;
  const linha = linhas[0];
  if (linha === undefined) throw new Error('insert de coleção não retornou linha');
  return mapColecao(linha);
}

export async function listarColecoes(tx: Tx, contaId: string): Promise<ColecaoResumo[]> {
  const linhas = await tx<LinhaColecao[]>`
    select id, nome, criado_por, criado_em, atualizado_em
    from colecoes where conta_id = ${contaId}
    order by criado_em desc`;
  return linhas.map(mapColecao);
}

export async function obterColecao(tx: Tx, id: string): Promise<Colecao | null> {
  const cols = await tx<{ id: string; nome: string; criado_por: string | null }[]>`
    select id, nome, criado_por from colecoes where id = ${id}`;
  const col = cols[0];
  if (col === undefined) return null;

  const campos = await tx<LinhaCampo[]>`
    select id, colecao_id, nome, tipo, ordem, config
    from campos where colecao_id = ${id}
    order by ordem, criado_em`;

  return { id: col.id, nome: col.nome, criadoPor: col.criado_por, campos: campos.map(mapCampo) };
}

export async function renomearColecao(
  tx: Tx,
  id: string,
  nome: string,
): Promise<ColecaoResumo | null> {
  const linhas = await tx<LinhaColecao[]>`
    update colecoes set nome = ${nome}, atualizado_em = now()
    where id = ${id}
    returning id, nome, criado_por, criado_em, atualizado_em`;
  const linha = linhas[0];
  return linha === undefined ? null : mapColecao(linha);
}

// Só o dono ou quem criou a planilha pode apagá-la.
export type ResultadoApagarColecao = 'ok' | 'nao-encontrado' | 'proibido';

export async function apagarColecao(
  tx: Tx,
  id: string,
  ator: { id: string; papel: 'dono' | 'membro' },
): Promise<ResultadoApagarColecao> {
  const cols = await tx<{ criado_por: string | null }[]>`
    select criado_por from colecoes where id = ${id}`;
  const col = cols[0];
  if (col === undefined) return 'nao-encontrado';

  const ehDono = ator.papel === 'dono';
  const ehCriador = col.criado_por === ator.id;
  if (!ehDono && !ehCriador) return 'proibido';

  await tx`delete from colecoes where id = ${id}`;
  return 'ok';
}

// Duplica o FORMATO de uma coleção: mesma configuração de blocos, planilha vazia.
// Copia nome/tipo/ordem/config de cada campo com id NOVO (id compartilhado entre
// coleções corromperia os `valores` de uma ao apagar campo da outra). Não copia
// registros (é o ponto do recurso) nem convites (escopados à coleção de origem).
// Retorna null quando a origem não é do dono (RLS) → 404.
export async function duplicarColecao(
  tx: Tx,
  contaId: string,
  origemId: string,
  criadoPor: string,
): Promise<Colecao | null> {
  const origem = await obterColecao(tx, origemId);
  if (origem === null) return null;

  const novas = await tx<LinhaColecao[]>`
    insert into colecoes (conta_id, nome, criado_por)
    values (${contaId}, ${`${origem.nome} (cópia)`}, ${criadoPor})
    returning id, nome, criado_por, criado_em, atualizado_em`;
  const nova = novas[0];
  if (nova === undefined) throw new Error('insert de coleção duplicada não retornou linha');

  const camposCopiados: Campo[] = [];
  for (const campo of origem.campos) {
    const linhas = await tx<LinhaCampo[]>`
      insert into campos (colecao_id, nome, tipo, ordem, config)
      values (${nova.id}, ${campo.nome}, ${campo.tipo}, ${campo.ordem}, ${tx.json(campo.config)})
      returning id, colecao_id, nome, tipo, ordem, config`;
    const linha = linhas[0];
    if (linha === undefined) throw new Error('insert de campo duplicado não retornou linha');
    camposCopiados.push(mapCampo(linha));
  }

  return { id: nova.id, nome: nova.nome, criadoPor, campos: camposCopiados };
}
