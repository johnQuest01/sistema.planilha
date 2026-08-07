import type { Tx } from '../db/comConta';
import type { Integracao } from '../../../shared/tipos';

interface LinhaIntegracao {
  id: string;
  nome: string;
  colecao_ids: unknown;
  ativo: boolean;
  criado_em: Date | string;
  atualizado_em: Date | string;
}

function iso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

function idsDe(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function mapIntegracao(r: LinhaIntegracao): Integracao {
  return {
    id: r.id,
    nome: r.nome,
    colecaoIds: idsDe(r.colecao_ids),
    ativo: r.ativo,
    criadoEm: iso(r.criado_em),
    atualizadoEm: iso(r.atualizado_em),
  };
}

// A tabela `integracoes` só nasce na migration 015. Se um deploy subir ANTES de
// migrar (ou a migration falhar), consultá-la estoura 42P01 — e como tudo roda
// dentro de uma transação (comConta), o erro ABORTA a transação inteira, então um
// try/catch em volta do select não segura: o erro propaga e a tela dá 500. Por isso
// checamos a existência ANTES com to_regclass (devolve NULL sem erro, não aborta
// nada). Sem a tabela, a LISTAGEM degrada para [] em vez de derrubar a página.
export async function listarIntegracoes(tx: Tx, contaId: string): Promise<Integracao[]> {
  const existe = await tx<{ reg: string | null }[]>`select to_regclass('public.integracoes') as reg`;
  if (existe[0]?.reg == null) return [];

  const linhas = await tx<LinhaIntegracao[]>`
    select id, nome, colecao_ids, ativo, criado_em, atualizado_em
    from integracoes where conta_id = ${contaId}
    order by criado_em desc`;
  return linhas.map(mapIntegracao);
}

export async function obterIntegracao(tx: Tx, id: string): Promise<Integracao | null> {
  const linhas = await tx<LinhaIntegracao[]>`
    select id, nome, colecao_ids, ativo, criado_em, atualizado_em
    from integracoes where id = ${id}`;
  const linha = linhas[0];
  return linha === undefined ? null : mapIntegracao(linha);
}

// Só aceita coleções que EXISTEM e são da conta (a RLS já filtra por conta, então
// basta conferir existência). Mantém a ordem enviada e remove duplicatas.
async function filtrarColecoesValidas(tx: Tx, ids: string[]): Promise<string[]> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return [];
  const linhas = await tx<{ id: string }[]>`
    select id from colecoes where id in ${tx(unicos)}`;
  const existentes = new Set(linhas.map((l) => l.id));
  return unicos.filter((id) => existentes.has(id));
}

export async function criarIntegracao(
  tx: Tx,
  contaId: string,
  dados: { nome: string; colecaoIds: string[]; ativo?: boolean },
  criadoPor: string,
): Promise<Integracao | { erro: 'colecoes-invalidas' }> {
  const validas = await filtrarColecoesValidas(tx, dados.colecaoIds);
  if (validas.length < 2) return { erro: 'colecoes-invalidas' };

  const linhas = await tx<LinhaIntegracao[]>`
    insert into integracoes (conta_id, nome, colecao_ids, ativo, criado_por)
    values (${contaId}, ${dados.nome}, ${tx.json(validas)}, ${dados.ativo ?? false}, ${criadoPor})
    returning id, nome, colecao_ids, ativo, criado_em, atualizado_em`;
  const linha = linhas[0];
  if (linha === undefined) throw new Error('insert de integração não retornou linha');
  return mapIntegracao(linha);
}

export async function editarIntegracao(
  tx: Tx,
  id: string,
  patch: { nome?: string; colecaoIds?: string[]; ativo?: boolean },
): Promise<Integracao | null | { erro: 'colecoes-invalidas' }> {
  const atual = await obterIntegracao(tx, id);
  if (atual === null) return null;

  let colecaoIds = atual.colecaoIds;
  if (patch.colecaoIds !== undefined) {
    const validas = await filtrarColecoesValidas(tx, patch.colecaoIds);
    if (validas.length < 2) return { erro: 'colecoes-invalidas' };
    colecaoIds = validas;
  }
  const nome = patch.nome ?? atual.nome;
  const ativo = patch.ativo ?? atual.ativo;

  const linhas = await tx<LinhaIntegracao[]>`
    update integracoes
    set nome = ${nome}, colecao_ids = ${tx.json(colecaoIds)}, ativo = ${ativo}, atualizado_em = now()
    where id = ${id}
    returning id, nome, colecao_ids, ativo, criado_em, atualizado_em`;
  const linha = linhas[0];
  return linha === undefined ? null : mapIntegracao(linha);
}

export async function apagarIntegracao(tx: Tx, id: string): Promise<boolean> {
  const linhas = await tx<{ id: string }[]>`delete from integracoes where id = ${id} returning id`;
  return linhas.length > 0;
}
