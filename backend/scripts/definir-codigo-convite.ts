import 'dotenv/config';
import postgres from 'postgres';
import { hash } from '@node-rs/argon2';

// Define (ou troca) o código de convite do workspace. Uso:
//   tsx scripts/definir-codigo-convite.ts <codigo>
// Guarda só o hash argon2 na conta do dono (config WORKSPACE_OWNER_EMAIL).
async function main(): Promise<void> {
  const codigo = process.argv[2];
  if (codigo === undefined || codigo.trim() === '') {
    console.error('uso: tsx scripts/definir-codigo-convite.ts <codigo>');
    process.exit(1);
  }
  const email = (process.env.WORKSPACE_OWNER_EMAIL ?? 'brunoacre07@gmail.com').toLowerCase();
  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    console.error('DATABASE_URL ausente no ambiente');
    process.exit(1);
  }

  const sql = postgres(url, { ssl: 'require', max: 1 });
  try {
    const hashCodigo = await hash(codigo.trim());
    const linhas = await sql<{ id: string }[]>`
      update contas set codigo_convite_hash = ${hashCodigo} where email = ${email} returning id`;
    if (linhas.length === 0) {
      console.error(`conta-workspace não encontrada para ${email}`);
      process.exit(1);
    }
    console.log(`código de convite definido para ${email}`);
  } finally {
    await sql.end();
  }
}

void main();
