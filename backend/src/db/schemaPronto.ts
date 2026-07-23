import { sql } from './client';

/**
 * Confirma que as migrations críticas já rodaram no Neon.
 * Sem isso o app sobe, mas GET /api/colecoes quebra (ex.: senha_hash ausente)
 * e as planilhas (MODELAGEM inclusive) parecem vazias/inexistentes.
 */
export async function garantirSchemaPronto(): Promise<void> {
  const colunas = await sql<{ ok: number }[]>`
    select 1 as ok
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'colecoes'
      and column_name = 'senha_hash'
    limit 1`;
  if (colunas[0]?.ok !== 1) {
    throw new Error(
      'Schema desatualizado: falta colecoes.senha_hash. Rode `npm run migrate` (migration 011_senha_oficina).',
    );
  }

  const tabelas = await sql<{ ok: number }[]>`
    select 1 as ok
    from information_schema.tables
    where table_schema = 'public' and table_name = 'colecao_acessos'
    limit 1`;
  if (tabelas[0]?.ok !== 1) {
    throw new Error(
      'Schema desatualizado: falta a tabela colecao_acessos. Rode `npm run migrate` (migration 011_senha_oficina).',
    );
  }
}
