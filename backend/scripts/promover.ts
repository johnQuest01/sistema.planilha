import 'dotenv/config';
import postgres from 'postgres';

// Promove um usuário a "dono" (admin que pode apagar qualquer planilha/registro).
// Uso: npx tsx scripts/promover.ts email@exemplo.com
async function main(): Promise<void> {
  const email = process.argv[2];
  if (email === undefined || email.trim() === '') {
    console.error('Informe o email: npx tsx scripts/promover.ts email@exemplo.com');
    process.exit(1);
  }
  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    console.error('DATABASE_URL ausente');
    process.exit(1);
  }
  const sql = postgres(url, { ssl: 'require', max: 1 });
  try {
    const linhas = await sql`
      update usuarios set papel = 'dono'
      where lower(email) = lower(${email.trim()})
      returning id, nome, email, papel`;
    if (linhas.length === 0) {
      console.log(`Nenhum usuário com email ${email}`);
    } else {
      for (const u of linhas) {
        console.log(`OK: ${u.nome} | ${u.email} -> ${u.papel}`);
      }
    }
  } finally {
    await sql.end();
  }
}

void main();
