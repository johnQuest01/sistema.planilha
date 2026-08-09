import { sql } from '../db/client';

export type StatusMembro = 'pendente' | 'ativo' | 'revogado';

export interface ContaMembro {
  contaId: string;
  usuarioId: string;
  status: StatusMembro;
  papel?: 'dono' | 'membro';
  tokenOrigem: string | null;
  criadoEm: string;
  aprovadoEm: string | null;
  revogadoEm: string | null;
  // preenchidos em listagens
  nome?: string;
  email?: string;
  contaNome?: string;
}

/**
 * Pedido de acesso com token.
 * - Se nunca foi aprovado (ou é novo): fica pendente (admin libera).
 * - Se já estava ativo: mantém ativo (só reaproveita o vínculo).
 * - Se estava revogado: volta a pendente (pedir permissão de novo).
 */
export async function pedirAcessoConta(
  contaId: string,
  usuarioId: string,
  tokenOrigem: string,
): Promise<{ status: StatusMembro; jaAtivo: boolean }> {
  const atuais = await sql<{ status: string }[]>`
    select status from conta_membros
    where conta_id = ${contaId} and usuario_id = ${usuarioId}`;
  const atual = atuais[0]?.status;

  if (atual === 'ativo') {
    await sql`
      update conta_membros
      set token_origem = ${tokenOrigem}, atualizado_em = now()
      where conta_id = ${contaId} and usuario_id = ${usuarioId}`;
    return { status: 'ativo', jaAtivo: true };
  }

  if (atual === undefined) {
    await sql`
      insert into conta_membros (conta_id, usuario_id, status, token_origem)
      values (${contaId}, ${usuarioId}, 'pendente', ${tokenOrigem})`;
    return { status: 'pendente', jaAtivo: false };
  }

  // revogado ou pendente → pendente de novo
  await sql`
    update conta_membros
    set status = 'pendente',
        token_origem = ${tokenOrigem},
        revogado_em = null,
        atualizado_em = now()
    where conta_id = ${contaId} and usuario_id = ${usuarioId}`;
  return { status: 'pendente', jaAtivo: false };
}

export async function aprovarAcesso(
  contaId: string,
  usuarioId: string,
): Promise<boolean> {
  const linhas = await sql<{ usuario_id: string }[]>`
    update conta_membros
    set status = 'ativo',
        aprovado_em = now(),
        revogado_em = null,
        atualizado_em = now()
    where conta_id = ${contaId}
      and usuario_id = ${usuarioId}
      and status = 'pendente'
    returning usuario_id`;
  return linhas.length > 0;
}

export async function revogarAcessoMembro(
  contaId: string,
  usuarioId: string,
): Promise<boolean> {
  const linhas = await sql<{ usuario_id: string }[]>`
    update conta_membros
    set status = 'revogado',
        revogado_em = now(),
        atualizado_em = now()
    where conta_id = ${contaId}
      and usuario_id = ${usuarioId}
      and status in ('ativo', 'pendente')
    returning usuario_id`;
  return linhas.length > 0;
}

/** Ao invalidar um token: derruba quem entrou/pediu com ele. */
export async function revogarMembrosDoToken(
  contaId: string,
  token: string,
): Promise<string[]> {
  const linhas = await sql<{ usuario_id: string }[]>`
    update conta_membros
    set status = 'revogado',
        revogado_em = now(),
        atualizado_em = now()
    where conta_id = ${contaId}
      and token_origem = ${token}
      and status in ('ativo', 'pendente')
    returning usuario_id`;
  return linhas.map((l) => l.usuario_id);
}

export async function membroAtivo(
  contaId: string,
  usuarioId: string,
): Promise<boolean> {
  const linhas = await sql<{ n: string }[]>`
    select 1::text as n from conta_membros
    where conta_id = ${contaId}
      and usuario_id = ${usuarioId}
      and status = 'ativo'`;
  return linhas.length > 0;
}

/** Status atual do vínculo (null = nunca pediu). */
export async function statusMembro(
  contaId: string,
  usuarioId: string,
): Promise<StatusMembro | null> {
  const linhas = await sql<{ status: string }[]>`
    select status from conta_membros
    where conta_id = ${contaId} and usuario_id = ${usuarioId}`;
  const s = linhas[0]?.status;
  if (s === 'pendente' || s === 'ativo' || s === 'revogado') return s;
  return null;
}

export async function listarPedidosPendentes(contaId: string): Promise<ContaMembro[]> {
  const linhas = await sql<
    {
      conta_id: string;
      usuario_id: string;
      status: string;
      token_origem: string | null;
      criado_em: Date;
      aprovado_em: Date | null;
      revogado_em: Date | null;
      nome: string;
      email: string;
    }[]
  >`
    select m.conta_id, m.usuario_id, m.status, m.token_origem,
           m.criado_em, m.aprovado_em, m.revogado_em,
           u.nome, u.email
    from conta_membros m
    join usuarios u on u.id = m.usuario_id
    where m.conta_id = ${contaId} and m.status = 'pendente'
    order by m.criado_em asc`;
  return linhas.map((l) => ({
    contaId: l.conta_id,
    usuarioId: l.usuario_id,
    status: 'pendente',
    tokenOrigem: l.token_origem,
    criadoEm: l.criado_em.toISOString(),
    aprovadoEm: null,
    revogadoEm: null,
    nome: l.nome,
    email: l.email,
  }));
}

export async function listarMembrosConvidados(contaId: string): Promise<ContaMembro[]> {
  const linhas = await sql<
    {
      conta_id: string;
      usuario_id: string;
      status: string;
      papel: string;
      token_origem: string | null;
      criado_em: Date;
      aprovado_em: Date | null;
      revogado_em: Date | null;
      nome: string;
      email: string;
    }[]
  >`
    select m.conta_id, m.usuario_id, m.status, coalesce(m.papel, 'membro') as papel,
           m.token_origem, m.criado_em, m.aprovado_em, m.revogado_em,
           u.nome, u.email
    from conta_membros m
    join usuarios u on u.id = m.usuario_id
    where m.conta_id = ${contaId} and m.status = 'ativo'
    order by lower(u.nome), u.email`;
  return linhas.map((l) => ({
    contaId: l.conta_id,
    usuarioId: l.usuario_id,
    status: 'ativo',
    papel: l.papel === 'dono' ? 'dono' : 'membro',
    tokenOrigem: l.token_origem,
    criadoEm: l.criado_em.toISOString(),
    aprovadoEm: l.aprovado_em?.toISOString() ?? null,
    revogadoEm: null,
    nome: l.nome,
    email: l.email,
  }));
}

export async function definirPapelConvidado(
  contaId: string,
  usuarioId: string,
  papel: 'dono' | 'membro',
): Promise<boolean> {
  const linhas = await sql<{ usuario_id: string }[]>`
    update conta_membros
    set papel = ${papel}, atualizado_em = now()
    where conta_id = ${contaId}
      and usuario_id = ${usuarioId}
      and status = 'ativo'
    returning usuario_id`;
  return linhas.length > 0;
}

/** Quantos admins efetivos a conta tem (nativos dono + convidados dono ativos). */
export async function contarAdminsConta(contaId: string): Promise<number> {
  const nativos = await sql<{ n: string }[]>`
    select count(*)::text as n from usuarios
    where conta_id = ${contaId} and papel = 'dono'`;
  const convidados = await sql<{ n: string }[]>`
    select count(*)::text as n from conta_membros
    where conta_id = ${contaId} and status = 'ativo' and papel = 'dono'`;
  return Number(nativos[0]?.n ?? '0') + Number(convidados[0]?.n ?? '0');
}

export interface ContaAcessivel {
  id: string;
  nome: string;
  papel: 'dono' | 'membro';
  home: boolean;
  status: 'ativo' | 'pendente';
}

/** Conta home + contas convidadas (ativas ou pendentes). */
export async function listarContasDoUsuario(usuarioId: string): Promise<ContaAcessivel[]> {
  const home = await sql<{ id: string; nome: string | null; papel: string }[]>`
    select c.id, c.nome, u.papel
    from usuarios u
    join contas c on c.id = u.conta_id
    where u.id = ${usuarioId}`;
  const h = home[0];
  const out: ContaAcessivel[] = [];
  if (h !== undefined) {
    out.push({
      id: h.id,
      nome: (h.nome ?? '').trim() || 'Minha conta',
      papel: h.papel === 'dono' ? 'dono' : 'membro',
      home: true,
      status: 'ativo',
    });
  }

  const outras = await sql<
    { id: string; nome: string | null; status: string; papel: string }[]
  >`
    select c.id, c.nome, m.status, coalesce(m.papel, 'membro') as papel
    from conta_membros m
    join contas c on c.id = m.conta_id
    where m.usuario_id = ${usuarioId}
      and m.status in ('ativo', 'pendente')
      and m.conta_id <> (select conta_id from usuarios where id = ${usuarioId})
    order by lower(coalesce(c.nome, '')), c.id`;

  for (const o of outras) {
    out.push({
      id: o.id,
      nome: (o.nome ?? '').trim() || 'Conta compartilhada',
      papel: o.papel === 'dono' ? 'dono' : 'membro',
      home: false,
      status: o.status === 'pendente' ? 'pendente' : 'ativo',
    });
  }
  return out;
}

export async function nomeConta(contaId: string): Promise<string> {
  const linhas = await sql<{ nome: string | null; email: string }[]>`
    select nome, email from contas where id = ${contaId}`;
  const l = linhas[0];
  if (l === undefined) return 'Conta';
  const n = (l.nome ?? '').trim();
  return n !== '' ? n : l.email;
}
