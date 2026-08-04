import crypto from 'node:crypto';
import { config } from '../config';

// Token de link público STATELESS: nada é gravado no banco. O token carrega o
// necessário (conta, registro, blocos escolhidos, validade) e é ASSINADO com
// HMAC-SHA256. Assim ninguém consegue forjar/alterar o conteúdo, e não há
// linha para gerenciar. Revogar TODOS os links = trocar o segredo (config).

export interface CargaLink {
  c: string; // contaId (para a RLS: comConta(c, ...))
  r: string; // registroId
  s: string[] | '*'; // ids dos blocos selecionados; '*' = todos
  e: number; // expira em (epoch segundos). 0 = nunca expira.
}

function assinar(cargaB64: string): string {
  return crypto.createHmac('sha256', config.linkPublicoSegredo).update(cargaB64).digest('base64url');
}

export function gerarLinkToken(carga: CargaLink): string {
  const cargaB64 = Buffer.from(JSON.stringify(carga), 'utf8').toString('base64url');
  return `${cargaB64}.${assinar(cargaB64)}`;
}

export function lerLinkToken(token: string): CargaLink | null {
  const ponto = token.lastIndexOf('.');
  if (ponto <= 0) return null;
  const cargaB64 = token.slice(0, ponto);
  const assinatura = token.slice(ponto + 1);
  if (cargaB64 === '' || assinatura === '') return null;

  // Comparação de tempo constante (evita timing attack na assinatura).
  const esperado = assinar(cargaB64);
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const carga = JSON.parse(Buffer.from(cargaB64, 'base64url').toString('utf8')) as CargaLink;
    if (typeof carga.c !== 'string' || typeof carga.r !== 'string') return null;
    if (carga.s !== '*' && !Array.isArray(carga.s)) return null;
    if (typeof carga.e !== 'number') return null;
    if (carga.e !== 0 && Date.now() > carga.e * 1000) return null; // expirado
    return carga;
  } catch {
    return null;
  }
}

// Calcula o "expira em" (epoch s) a partir do prazo em dias definido no config.
export function calcularExpiraEm(): number {
  if (config.linkPublicoDias <= 0) return 0;
  return Math.floor(Date.now() / 1000) + config.linkPublicoDias * 86400;
}
