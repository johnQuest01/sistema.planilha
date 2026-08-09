import crypto from 'node:crypto';
import { sql } from '../db/client';
import type { Tx } from '../db/comConta';

// Código curto e "bonito": alfabeto sem caracteres ambíguos (0/O, 1/l/I) para o link
// ficar fácil de ler/ditar. ~9 chars ⇒ 54^9 ≈ 7.9e15 combinações (colisão improvável;
// ainda assim há retry no insert).
const ALFABETO = '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const TAM_CODIGO = 9;

function gerarCodigo(): string {
  const bytes = crypto.randomBytes(TAM_CODIGO);
  let s = '';
  for (let i = 0; i < TAM_CODIGO; i++) {
    s += ALFABETO[(bytes[i] as number) % ALFABETO.length];
  }
  return s;
}

export interface ParteCompartilhada {
  registroId: string;
  fonte: string;
  blocos: string[];
}

export interface AlvoCompartilhado {
  contaId: string;
  registroId: string;
  blocos: string[] | '*';
  /** Quando presente, o link cobre várias planilhas (registro unido). */
  partes: ParteCompartilhada[] | null;
  titulo: string | null;
}

function parsePartes(raw: unknown): ParteCompartilhada[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ParteCompartilhada[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const registroId = typeof o.registroId === 'string' ? o.registroId : '';
    const fonte = typeof o.fonte === 'string' ? o.fonte : '';
    const blocos = Array.isArray(o.blocos)
      ? o.blocos.filter((b): b is string => typeof b === 'string' && b.length > 0)
      : [];
    if (registroId === '' || blocos.length === 0) continue;
    out.push({ registroId, fonte, blocos });
  }
  return out.length > 0 ? out : null;
}

// Cria o link curto (dentro de comConta(contaId), para a RLS conferir a conta).
// Retry em colisão de código (unique_violation 23505).
export async function criarCompartilhamento(
  tx: Tx,
  contaId: string,
  dados: {
    registroId: string;
    blocos: string[] | '*';
    expiraEm: Date | null;
    criadoPor: string | null;
    partes?: ParteCompartilhada[] | null;
    titulo?: string | null;
  },
): Promise<string> {
  const corpoBlocos = tx.json(dados.blocos as never);
  const corpoPartes =
    dados.partes !== undefined && dados.partes !== null && dados.partes.length > 0
      ? tx.json(dados.partes as never)
      : null;
  const titulo = dados.titulo ?? null;
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = gerarCodigo();
    try {
      await tx`
        insert into compartilhamentos
          (codigo, conta_id, registro_id, blocos, expira_em, criado_por, partes, titulo)
        values (
          ${codigo}, ${contaId}, ${dados.registroId}, ${corpoBlocos},
          ${dados.expiraEm}, ${dados.criadoPor}, ${corpoPartes}, ${titulo}
        )`;
      return codigo;
    } catch (e) {
      const code = e !== null && typeof e === 'object' && 'code' in e ? (e as { code?: string }).code : undefined;
      if (code === '23505') continue; // código repetido: tenta outro
      throw e;
    }
  }
  throw new Error('não foi possível gerar um código único de compartilhamento');
}

// Resolve um link curto PÚBLICO (sem conta): só se existir, não revogado e não
// expirado. Devolve a conta/registro/blocos para a rota ler os dados via comConta.
export async function lerCompartilhamento(codigo: string): Promise<AlvoCompartilhado | null> {
  const linhas = await sql<
    { conta_id: string; registro_id: string; blocos: unknown; partes: unknown; titulo: string | null }[]
  >`
    select conta_id, registro_id, blocos, partes, titulo
    from compartilhamentos
    where codigo = ${codigo}
      and revogado_em is null
      and (expira_em is null or expira_em > now())
    limit 1`;
  const l = linhas[0];
  if (l === undefined) return null;
  const blocos: string[] | '*' = Array.isArray(l.blocos) ? (l.blocos as string[]) : '*';
  return {
    contaId: l.conta_id,
    registroId: l.registro_id,
    blocos,
    partes: parsePartes(l.partes),
    titulo: l.titulo,
  };
}

// Revoga UM link específico (dentro de comConta(contaId)). Retorna quantos afetou.
export async function revogarCompartilhamento(tx: Tx, codigo: string): Promise<number> {
  const linhas = await tx<{ codigo: string }[]>`
    update compartilhamentos set revogado_em = now()
    where codigo = ${codigo} and revogado_em is null
    returning codigo`;
  return linhas.length;
}
