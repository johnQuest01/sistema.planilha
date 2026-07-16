import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

async function main(): Promise<void> {
  // Migrations vão pela DIRECT (sem PgBouncer): DDL longo por pooler em transaction
  // mode é onde nascem erros que não se reproduzem (ver seção 7.6). Fallback pra
  // DATABASE_URL mantém o dev, que não tem string separada.
  const databaseUrl = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    console.error('DATABASE_URL ausente. Preencha backend/.env antes de migrar.');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { ssl: 'require', max: 1 });

  try {
    await sql`
      create table if not exists _migrations (
        nome        text primary key,
        aplicada_em timestamptz not null default now()
      )`;

    const aplicadas = new Set(
      (await sql<{ nome: string }[]>`select nome from _migrations`).map((r) => r.nome),
    );

    const arquivos = (await readdir(__dirname))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let rodadas = 0;
    for (const arquivo of arquivos) {
      if (aplicadas.has(arquivo)) continue;
      const conteudo = await readFile(path.join(__dirname, arquivo), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(conteudo);
        await tx`insert into _migrations (nome) values (${arquivo})`;
      });
      console.log(`aplicada: ${arquivo}`);
      rodadas += 1;
    }

    console.log(rodadas === 0 ? 'nada a migrar (tudo em dia)' : `ok: ${rodadas} migration(s)`);
  } finally {
    await sql.end();
  }
}

void main();
