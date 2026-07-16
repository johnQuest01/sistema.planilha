import 'dotenv/config';

function obrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (valor === undefined || valor.trim() === '') {
    throw new Error(`Variável de ambiente ausente: ${nome}`);
  }
  return valor;
}

export const config = {
  databaseUrl: obrigatoria('DATABASE_URL'),
  port: Number(process.env.PORT ?? 3333),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  // Segredo pra assinar o cookie de sessão. Em produção vem do ambiente; o
  // fallback só existe pro dev não travar. NUNCA use o fallback em produção.
  cookieSecret:
    process.env.COOKIE_SECRET ?? 'dev-inseguro-troque-em-producao-2f9c1a7b4e6d8005',
  isProd: process.env.NODE_ENV === 'production',
} as const;
