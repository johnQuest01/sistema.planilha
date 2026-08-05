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

export interface AlvoCompartilhado {
  contaId: string;
  registroId: string;
  blocos: string[] | '*';
}

// Cria o link curto (dentro de comConta(contaId), para a RLS conferir a conta).
// Retry em colisão de código (unique_violation 23505).
export async function criarCompartilhamento(
  tx: Tx,
  contaId: string,
  dados: { registroId: string; blocos: string[] | '*'; expiraEm: Date | null; criadoPor: string | null },
): Promise<string> {
  const corpoBlocos = tx.json(dados.blocos as never);
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = gerarCodigo();
    try {
      await tx`
        insert into compartilhamentos (codigo, conta_id, registro_id, blocos, expira_em, criado_por)
        values (${codigo}, ${contaId}, ${dados.registroId}, ${corpoBlocos}, ${dados.expiraEm}, ${dados.criadoPor})`;
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
  const linhas = await sql<{ conta_id: string; registro_id: string; blocos: unknown }[]>`
    select conta_id, registro_id, blocos
    from compartilhamentos
    where codigo = ${codigo}
      and revogado_em is null
      and (expira_em is null or expira_em > now())
    limit 1`;
  const l = linhas[0];
  if (l === undefined) return null;
  const blocos: string[] | '*' = Array.isArray(l.blocos) ? (l.blocos as string[]) : '*';
  return { contaId: l.conta_id, registroId: l.registro_id, blocos };
}

// Revoga UM link específico (dentro de comConta(contaId)). Retorna quantos afetou.
export async function revogarCompartilhamento(tx: Tx, codigo: string): Promise<number> {
  const linhas = await tx<{ codigo: string }[]>`
    update compartilhamentos set revogado_em = now()
    where codigo = ${codigo} and revogado_em is null
    returning codigo`;
  return linhas.length;
}
