import 'dotenv/config';
import { sql } from '../db/client';
import { apagarObjeto, keyMini } from '../r2/r2';

// Limpeza manual dos órfãos (seção 6.4): apaga do bucket o que está em lixo_r2 há mais
// de 7 dias (cheia + _t) e marca limpo_em. Rode com: npm run limpar-r2 -w backend.
// Cron depois, se valer a pena.
async function main(): Promise<void> {
  const pendentes = await sql<{ key: string }[]>`
    select key from lixo_r2
    where limpo_em is null and criado_em < now() - interval '7 days'`;

  let ok = 0;
  for (const { key } of pendentes) {
    try {
      await apagarObjeto(key);
      await apagarObjeto(keyMini(key));
      await sql`update lixo_r2 set limpo_em = now() where key = ${key}`;
      ok += 1;
    } catch (erro) {
      console.error(`falhou ao limpar ${key}:`, erro);
    }
  }

  console.log(`limpas ${ok}/${pendentes.length} key(s)`);
  await sql.end();
}

void main();
