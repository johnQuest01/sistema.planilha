import { sql } from '../db/client';
import { config } from '../config';

// A conta-workspace é a do dono (config.workspaceOwnerEmail). Todo cadastro novo
// entra nela. O id não muda, então cacheamos; o hash do código pode ser trocado
// depois, então lemos sempre fresco.

let contaIdCache: string | null = null;

export async function workspaceContaId(): Promise<string> {
  if (contaIdCache !== null) return contaIdCache;
  const linhas = await sql<{ id: string }[]>`
    select id from contas where email = ${config.workspaceOwnerEmail}`;
  const l = linhas[0];
  if (l === undefined) {
    throw new Error(`conta-workspace não encontrada para ${config.workspaceOwnerEmail}`);
  }
  contaIdCache = l.id;
  return l.id;
}

export async function workspaceCodigoHash(): Promise<string | null> {
  const linhas = await sql<{ codigo_convite_hash: string | null }[]>`
    select codigo_convite_hash from contas where email = ${config.workspaceOwnerEmail}`;
  return linhas[0]?.codigo_convite_hash ?? null;
}
