import { randomBytes } from 'node:crypto';
import { sql } from '../db/client';

// Sessão fica FORA da RLS de conta (a auth media o acesso, ver migration 003):
// aqui falamos direto com `sql`, fora do `comConta`, como as rotas de `contas`.

const DURACAO_MS = 1000 * 60 * 60 * 24 * 30; // 30 dias, casa com o maxAge do cookie

// 32 bytes em base64url → 43 chars. É o valor que vai (assinado) no cookie.
export const FORMATO_ID_SESSAO = /^[A-Za-z0-9_-]{43}$/;

export async function criarSessao(contaId: string): Promise<string> {
  const id = randomBytes(32).toString('base64url');
  const expiraEm = new Date(Date.now() + DURACAO_MS);
  await sql`
    insert into sessoes (id, conta_id, expira_em)
    values (${id}, ${contaId}, ${expiraEm})`;
  return id;
}

// Retorna o conta_id se a sessão existe, não está revogada e não expirou. Senão null.
export async function contaDaSessao(id: string): Promise<string | null> {
  const linhas = await sql<{ conta_id: string }[]>`
    select conta_id from sessoes
    where id = ${id} and revogado_em is null and expira_em > now()`;
  return linhas[0]?.conta_id ?? null;
}

export async function revogarSessao(id: string): Promise<void> {
  await sql`update sessoes set revogado_em = now() where id = ${id} and revogado_em is null`;
}

// Usada ao trocar a senha: derruba todas as sessões vivas da conta.
export async function revogarSessoesDaConta(contaId: string): Promise<void> {
  await sql`
    update sessoes set revogado_em = now()
    where conta_id = ${contaId} and revogado_em is null`;
}
