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

// Em produção, sem segredo o processo não sobe (falhar no deploy é melhor que
// assinar sessão com string de dev). Em dev, fallback funcional.
const cookieSecret = isProd
  ? obrigatoria('COOKIE_SECRET')
  : opcional('COOKIE_SECRET', 'dev-inseguro-nao-use-em-producao');

export const config = {
  databaseUrl: obrigatoria('DATABASE_URL'),
  port: Number(process.env.PORT ?? 3333),
  corsOrigin: opcional('CORS_ORIGIN', 'http://localhost:5173'),
  cookieSecret,
  // ---- Link público de compartilhamento (ADMIN BRUNO define) ----
  // Segredo que ASSINA os links públicos. Trocá-lo REVOGA todos os links já
  // gerados (env LINK_PUBLICO_SEGREDO). Sem env, reusa o COOKIE_SECRET.
  linkPublicoSegredo: opcional('LINK_PUBLICO_SEGREDO', cookieSecret),
  // Prazo (em dias) até o link expirar. 0 = nunca expira. (env LINK_PUBLICO_DIAS)
  linkPublicoDias: Math.max(0, Math.floor(Number(opcional('LINK_PUBLICO_DIAS', '30')) || 0)),
  // E-mail do dono cuja conta é o "workspace" compartilhado: todo cadastro novo
  // cai nessa conta. Configurável por env; default é a conta do Bruno.
  workspaceOwnerEmail: opcional('WORKSPACE_OWNER_EMAIL', 'brunoacre07@gmail.com').toLowerCase(),
  // E-mails com acesso livre à planilha Oficina (sem digitar a senha da planilha).
  // Lista separada por vírgula em PLANILHA_ACESSO_LIVRE_EMAILS, se quiser sobrescrever.
  planilhaAcessoLivreEmails: opcional(
    'PLANILHA_ACESSO_LIVRE_EMAILS',
    [
      'brunoacre07@gmail.com',
      'jurandirsilvadesena123@gmail.com',
      'auriceliodossantos1977@gmail.com', // Célio
      'kakaalfa2006@gmail.com', // Kauan
      'aleblackdog@gmail.com', // Alex
    ].join(','),
  )
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0),
  isProd,
} as const;
