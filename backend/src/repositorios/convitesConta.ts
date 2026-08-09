import crypto from 'node:crypto';
import { sql } from '../db/client';

// Código curto (sem 0/O/1/l/I) — fácil de ditar; ~10 chars ⇒ espaço enorme.
const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const TAM = 8;

function normalizarToken(token: string): string {
  return token.trim().toUpperCase();
}

function gerarToken(): string {
  const bytes = crypto.randomBytes(TAM);
  let s = '';
  for (let i = 0; i < TAM; i++) {
    s += ALFABETO[(bytes[i] as number) % ALFABETO.length];
  }
  // Formato legível MOST-XXXX-XXXX (igual ao gerador da Config antiga).
  return `MOST-${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

export interface ConviteConta {
  token: string;
  contaId: string;
  rotulo: string | null;
  criadoPor: string | null;
  expiraEm: string | null;
  revogadoEm: string | null;
  usos: number;
  maxUsos: number | null;
  criadoEm: string;
}

function mapear(l: {
  token: string;
  conta_id: string;
  rotulo: string | null;
  criado_por: string | null;
  expira_em: Date | null;
  revogado_em: Date | null;
  usos: number;
  max_usos: number | null;
  criado_em: Date;
}): ConviteConta {
  return {
    token: l.token,
    contaId: l.conta_id,
    rotulo: l.rotulo,
    criadoPor: l.criado_por,
    expiraEm: l.expira_em?.toISOString() ?? null,
    revogadoEm: l.revogado_em?.toISOString() ?? null,
    usos: l.usos,
    maxUsos: l.max_usos,
    criadoEm: l.criado_em.toISOString(),
  };
}

export async function criarConviteConta(
  contaId: string,
  criadoPor: string,
  opts?: { rotulo?: string; diasValidade?: number; maxUsos?: number },
): Promise<ConviteConta> {
  // Padrão seguro: 7 dias, 1 uso (admin pode pedir mais na API).
  const dias =
    opts?.diasValidade !== undefined && opts.diasValidade > 0 ? opts.diasValidade : 7;
  const expiraEm = new Date(Date.now() + dias * 86400 * 1000);
  const maxUsos =
    opts?.maxUsos !== undefined && opts.maxUsos > 0 ? opts.maxUsos : 1;
  const rotulo = opts?.rotulo?.trim() ? opts.rotulo.trim().slice(0, 80) : null;

  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const token = normalizarToken(gerarToken());
    try {
      const linhas = await sql<
        {
          token: string;
          conta_id: string;
          rotulo: string | null;
          criado_por: string | null;
          expira_em: Date | null;
          revogado_em: Date | null;
          usos: number;
          max_usos: number | null;
          criado_em: Date;
        }[]
      >`
        insert into convites_conta
          (token, conta_id, rotulo, criado_por, expira_em, max_usos)
        values
          (${token}, ${contaId}, ${rotulo}, ${criadoPor}, ${expiraEm}, ${maxUsos})
        returning *`;
      const l = linhas[0];
      if (l === undefined) throw new Error('insert convite não retornou linha');
      return mapear(l);
    } catch (e) {
      const code = e !== null && typeof e === 'object' && 'code' in e ? (e as { code?: string }).code : undefined;
      if (code === '23505') continue;
      throw e;
    }
  }
  throw new Error('não foi possível gerar token de convite único');
}

export async function listarConvitesConta(contaId: string): Promise<ConviteConta[]> {
  const linhas = await sql<
    {
      token: string;
      conta_id: string;
      rotulo: string | null;
      criado_por: string | null;
      expira_em: Date | null;
      revogado_em: Date | null;
      usos: number;
      max_usos: number | null;
      criado_em: Date;
    }[]
  >`
    select *
    from convites_conta
    where conta_id = ${contaId}
    order by criado_em desc`;
  return linhas.map(mapear);
}

export async function revogarConviteConta(contaId: string, token: string): Promise<boolean> {
  const linhas = await sql<{ token: string }[]>`
    update convites_conta
    set revogado_em = now()
    where token = ${token}
      and conta_id = ${contaId}
      and revogado_em is null
    returning token`;
  return linhas.length > 0;
}

export type ConviteEncontrado = {
  token: string;
  contaId: string;
  usos: number;
  maxUsos: number | null;
  expiraEm: Date | null;
  revogadoEm: Date | null;
  /** Ainda pode gastar 1 uso (não revogado, não expirado, usos < máx). */
  disponivel: boolean;
};

/** Achado por código (maiúsculo), mesmo se já esgotado — para quem já pediu/foi aprovado. */
export async function acharConviteConta(token: string): Promise<ConviteEncontrado | null> {
  const limpo = normalizarToken(token);
  if (limpo === '') return null;
  const linhas = await sql<
    {
      token: string;
      conta_id: string;
      usos: number;
      max_usos: number | null;
      expira_em: Date | null;
      revogado_em: Date | null;
    }[]
  >`
    select token, conta_id, usos, max_usos, expira_em, revogado_em
    from convites_conta
    where upper(token) = ${limpo}`;
  const l = linhas[0];
  if (l === undefined) return null;
  const revogado = l.revogado_em !== null;
  const expirado = l.expira_em !== null && l.expira_em.getTime() <= Date.now();
  const esgotado = l.max_usos !== null && l.usos >= l.max_usos;
  return {
    token: l.token,
    contaId: l.conta_id,
    usos: l.usos,
    maxUsos: l.max_usos,
    expiraEm: l.expira_em,
    revogadoEm: l.revogado_em,
    disponivel: !revogado && !expirado && !esgotado,
  };
}

/** Só valida para NOVO uso (não gasta). null = inválido/expirado/esgotado/revogado. */
export async function olharConviteConta(
  token: string,
): Promise<{ contaId: string; token: string } | null> {
  const c = await acharConviteConta(token);
  if (c === null || !c.disponivel) return null;
  return { contaId: c.contaId, token: c.token };
}

/** Resolve um token válido → conta_id. Incrementa `usos`. null = inválido/expirado/esgotado. */
export async function consumirConviteConta(token: string): Promise<string | null> {
  const limpo = normalizarToken(token);
  if (limpo === '') return null;
  const linhas = await sql<{ conta_id: string }[]>`
    update convites_conta
    set usos = usos + 1
    where upper(token) = ${limpo}
      and revogado_em is null
      and (expira_em is null or expira_em > now())
      and (max_usos is null or usos < max_usos)
    returning conta_id`;
  return linhas[0]?.conta_id ?? null;
}
