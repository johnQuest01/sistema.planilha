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
  /** Workspace "home" do usuário (onde ele é dono/membro nativo). */
  contaHomeId: string;
  nome: string;
  email: string;
  /** Papel NA conta da sessão (home ou convidado com papel em conta_membros). */
  papel: 'dono' | 'membro';
  contaNome: string;
}

export async function usuarioDaSessao(id: string): Promise<UsuarioSessao | null> {
  const linhas = await sql<
    {
      usuario_id: string;
      sessao_conta_id: string;
      home_conta_id: string;
      nome: string;
      email: string;
      papel_home: string;
      papel_membro: string | null;
      conta_nome: string | null;
      membro_ok: boolean;
    }[]
  >`
    select
      u.id as usuario_id,
      s.conta_id as sessao_conta_id,
      u.conta_id as home_conta_id,
      u.nome,
      u.email,
      u.papel as papel_home,
      (
        select m.papel from conta_membros m
        where m.conta_id = s.conta_id
          and m.usuario_id = u.id
          and m.status = 'ativo'
        limit 1
      ) as papel_membro,
      c.nome as conta_nome,
      (
        s.conta_id = u.conta_id
        or exists (
          select 1 from conta_membros m
          where m.conta_id = s.conta_id
            and m.usuario_id = u.id
            and m.status = 'ativo'
        )
      ) as membro_ok
    from sessoes s
    join usuarios u on u.id = s.usuario_id
    join contas c on c.id = s.conta_id
    where s.id = ${id} and s.revogado_em is null and s.expira_em > now()`;
  const l = linhas[0];
  if (l === undefined || !l.membro_ok) return null;

  const naHome = l.sessao_conta_id === l.home_conta_id;
  const nomeConta = (l.conta_nome ?? '').trim() || (naHome ? 'Minha conta' : 'Conta compartilhada');
  const papel: 'dono' | 'membro' = naHome
    ? l.papel_home === 'dono'
      ? 'dono'
      : 'membro'
    : l.papel_membro === 'dono'
      ? 'dono'
      : 'membro';
  return {
    usuarioId: l.usuario_id,
    contaId: l.sessao_conta_id,
    contaHomeId: l.home_conta_id,
    nome: l.nome,
    email: l.email,
    papel,
    contaNome: nomeConta,
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

/** Derruba só as sessões de um usuário (ex.: admin trocou a senha dele). */
export async function revogarSessoesDoUsuario(usuarioId: string): Promise<void> {
  await sql`
    update sessoes set revogado_em = now()
    where usuario_id = ${usuarioId} and revogado_em is null`;
}

/** Derruba sessões de um usuário só numa conta (tirou acesso convidado). */
export async function revogarSessoesDoUsuarioNaConta(
  usuarioId: string,
  contaId: string,
): Promise<void> {
  await sql`
    update sessoes set revogado_em = now()
    where usuario_id = ${usuarioId}
      and conta_id = ${contaId}
      and revogado_em is null`;
}
