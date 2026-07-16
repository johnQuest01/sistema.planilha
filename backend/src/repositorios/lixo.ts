import type { Tx } from '../db/comConta';

// Marca keys pra limpeza posterior no R2 (ver 6.4). Idempotente: `on conflict do
// nothing` cobre a mesma key marcada duas vezes. Guarda só a cheia; o `_t` é derivado
// no momento da limpeza.
export async function marcarLixo(tx: Tx, keys: string[], motivo: string): Promise<void> {
  for (const key of keys) {
    await tx`insert into lixo_r2 (key, motivo) values (${key}, ${motivo}) on conflict (key) do nothing`;
  }
}
