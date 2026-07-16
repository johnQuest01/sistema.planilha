import 'dotenv/config';

function obrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (valor === undefined || valor.trim() === '') {
    throw new Error(`Variável de ambiente ausente: ${nome}`);
  }
  return valor;
}

// `??` cai no fallback só com null/undefined; `COOKIE_SECRET=` no .env é string
// vazia e passaria reto. O trim() aqui pega o vazio, que é o bug do 2.5.2.
function opcional(nome: string, padrao: string): string {
  const v = process.env[nome];
  return v === undefined || v.trim() === '' ? padrao : v;
}

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  databaseUrl: obrigatoria('DATABASE_URL'),
  port: Number(process.env.PORT ?? 3333),
  corsOrigin: opcional('CORS_ORIGIN', 'http://localhost:5173'),
  // Em produção, sem segredo o processo não sobe (falhar no deploy é melhor que
  // assinar sessão com string de dev). Em dev, fallback funcional.
  cookieSecret: isProd
    ? obrigatoria('COOKIE_SECRET')
    : opcional('COOKIE_SECRET', 'dev-inseguro-nao-use-em-producao'),
  isProd,
} as const;
