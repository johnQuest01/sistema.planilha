import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'node:crypto';
import { ErroHttp } from '../erros';

// Alfabeto URL-safe (mesmo do nanoid): casa com a regex [A-Za-z0-9_-]{21} do validador.
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const EXPIRA_S = 60; // presigned PUT curto (seção 6.1)

const EXT_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

interface ConfigR2 {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBase: string;
}

// Lida sob demanda: sem R2 configurado o app sobe normal; só a rota de upload
// (e o limpar-r2) falham, com mensagem clara, em vez de derrubar o boot.
function lerConfig(): ConfigR2 {
  const faltando: string[] = [];
  function req(nome: string): string {
    const v = process.env[nome];
    if (v === undefined || v.trim() === '') {
      faltando.push(nome);
      return '';
    }
    return v;
  }
  const cfg: ConfigR2 = {
    accountId: req('R2_ACCOUNT_ID'),
    accessKeyId: req('R2_ACCESS_KEY_ID'),
    secretAccessKey: req('R2_SECRET_ACCESS_KEY'),
    bucket: req('R2_BUCKET'),
    publicBase: req('R2_PUBLIC_BASE'),
  };
  if (faltando.length > 0) {
    throw new ErroHttp(503, `R2 não configurado: faltam ${faltando.join(', ')}`);
  }
  return cfg;
}

let cliente: S3Client | null = null;
let configCache: ConfigR2 | null = null;

function ctx(): { s3: S3Client; cfg: ConfigR2 } {
  if (cliente === null || configCache === null) {
    const cfg = lerConfig();
    configCache = cfg;
    // Endpoint S3 do R2 montado da env, região auto (ver 7.4).
    cliente = new S3Client({
      region: 'auto',
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      // O AWS SDK v3 (>= 3.729) passou a exigir checksum CRC32 por padrão em PutObject.
      // O Cloudflare R2 REJEITA esse header (403/400), então o PUT pré-assinado da foto
      // falhava e a key nunca era gravada no registro — a foto "não salvava no banco".
      // WHEN_REQUIRED desliga o checksum automático e restaura a compatibilidade com o R2.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  return { s3: cliente, cfg: configCache };
}

function nano21(): string {
  let s = '';
  for (const b of randomBytes(21)) s += ALFABETO.charAt(b & 63);
  return s;
}

export function extDoMime(mime: string): string | null {
  return EXT_POR_MIME[mime] ?? null;
}

// Key gerada SEMPRE pelo servidor (7.2c): <colecao>/<registro>/<nano21>.<ext>.
// O cliente nunca escolhe — é a única proteção da foto num bucket público.
export function novaKey(colecaoId: string, registroId: string, ext: string): string {
  return `${colecaoId}/${registroId}/${nano21()}.${ext}`;
}

// A miniatura é derivada por convenção (6.1): .jpg -> _t.jpg. Não se guarda a key
// da mini no jsonb; ela se monta daqui.
export function keyMini(key: string): string {
  return key.replace(/\.(\w+)$/, '_t.$1');
}

export function urlPublica(key: string): string {
  return `${ctx().cfg.publicBase}/${key}`;
}

// Cache eterno e imutável (keys content-addressed nunca mudam). NÃO é mais
// ASSINADO no presign: assinar CacheControl obriga o navegador a enviar o header
// `cache-control` no PUT, e esse header dispara um preflight CORS que o bucket R2
// (r2-cors.json permite só `content-type`) NEGA — o PUT falhava com "Failed to
// fetch" e a foto nunca subia. Mantido aqui só como referência; para reativar o
// cache imutável, prefira uma Cache Rule no domínio r2.dev (sem exigir CORS).
export const CACHE_CONTROL_IMUTAVEL = 'public, max-age=31536000, immutable';

// Presigned PUT com ContentLength e ContentType assinados: o cliente manda
// exatamente esse tamanho e tipo (limita o upload) e SÓ o header `content-type`,
// que o CORS do bucket já libera — sem `cache-control` para não quebrar o preflight.
export async function presignPut(key: string, mime: string, tamanho: number): Promise<string> {
  const { s3, cfg } = ctx();
  const cmd = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    ContentType: mime,
    ContentLength: tamanho,
  });
  // Reforço: caso alguma versão do SDK ainda insira o header de checksum, ele NÃO entra
  // na assinatura, evitando o "SignatureDoesNotMatch" do R2 no PUT do navegador.
  return getSignedUrl(s3, cmd, {
    expiresIn: EXPIRA_S,
    unsignableHeaders: new Set(['x-amz-checksum-crc32']),
  });
}

export async function apagarObjeto(key: string): Promise<void> {
  const { s3, cfg } = ctx();
  await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}
