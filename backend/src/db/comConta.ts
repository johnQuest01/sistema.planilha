import type postgres from 'postgres';
import { sql } from './client';

export type Tx = postgres.TransactionSql<Record<string, never>>;

// Único ponto por onde o caminho DONO toca o banco: abre transação e fixa
// `app.conta_id` como local, para a RLS (migration 002) filtrar tudo por conta.
// Sem isso, as políticas veem NULL e nada aparece — deny por padrão.
export async function comConta<T>(contaId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const resultado = await sql.begin(async (tx) => {
    await tx`select set_config('app.conta_id', ${contaId}, true)`;
    return fn(tx);
  });
  return resultado as unknown as T;
}
