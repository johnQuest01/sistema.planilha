import { randomBytes } from 'node:crypto';
import { sql } from '../db/client';

// Sessão fica FORA da RLS de conta (a auth media o acesso, ver migration 003):
// aqui falamos direto com `sql`, fora do `comConta`, como as rotas de `contas`.

const DURACAO_MS = 1000 * 60 * 60 * 24 * 30; // 30 dias, casa com o maxAge do cookie

// 32 bytes em base64url → 43 chars. É o valor que vai (assinado) no cookie.
export const FORMATO_ID_SESSAO = /^[A-Za-z0-9_-]{43}$/;

export async function criarSessao(usuarioId: string, contaId: string): Promise<string> {
  const id = randomBytes(32).toString('base64url');
  const expiraEm = new Date(Date.now() + DURACAO_MS);
  await sql`
    insert into sessoes (id, conta_id, usuario_id, expira_em)
    values (${id}, ${contaId}, ${usuarioId}, ${expiraEm})`;
  return id;
}

// Dados do usuário logado a partir da sessão (viva, não revogada, não expirada).
// Junta usuarios para trazer nome/papel; null se a sessão não vale mais.
export interface UsuarioSessao {
  usuarioId: string;
  contaId: string;
  nome: string;
  email: string;
  papel: 'dono' | 'membro';
}

export async function usuarioDaSessao(id: string): Promise<UsuarioSessao | null> {
  const linhas = await sql<
    { usuario_id: string; conta_id: string; nome: string; email: string; papel: string }[]
  >`
    select u.id as usuario_id, s.conta_id, u.nome, u.email, u.papel
    from sessoes s
    join usuarios u on u.id = s.usuario_id
    where s.id = ${id} and s.revogado_em is null and s.expira_em > now()`;
  const l = linhas[0];
  if (l === undefined) return null;
  return {
    usuarioId: l.usuario_id,
    contaId: l.conta_id,
    nome: l.nome,
    email: l.email,
    papel: l.papel === 'dono' ? 'dono' : 'membro',
  };
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
