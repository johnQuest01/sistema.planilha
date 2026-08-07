// Backup INCREMENTAL e SÓ-ADIÇÃO do bucket de fotos do R2 para um bucket de backup.
// Usa DOIS tokens (os do R2 são escopados por bucket): um LÊ a origem e outro ESCREVE
// no backup. Copia client-side (GET na origem -> PUT no backup) apenas o que ainda não
// existe (ou mudou de tamanho). NUNCA apaga do backup — é a proteção contra o bucket
// principal ser esvaziado por engano.
//
// Uso local:  node scripts/backup-r2.mjs   (com as env vars abaixo definidas)
//
// Variáveis (env):
//   R2_ACCOUNT_ID            conta Cloudflare (hash do endpoint)
//   R2_BUCKET                origem  (default: mostruario-midia)
//   R2_SRC_ACCESS_KEY_ID     token que LÊ a origem
//   R2_SRC_SECRET_ACCESS_KEY
//   R2_BACKUP_BUCKET         destino (ex.: sistema-backup-mostruario1)
//   R2_DST_ACCESS_KEY_ID     token que ESCREVE no destino
//   R2_DST_SECRET_ACCESS_KEY
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

function req(nome) {
  const v = process.env[nome];
  if (!v || v.trim() === '') {
    console.error(`Falta a variável de ambiente: ${nome}`);
    process.exit(1);
  }
  return v.trim();
}

const accountId = req('R2_ACCOUNT_ID');
const origem = process.env.R2_BUCKET?.trim() || 'mostruario-midia';
const destino = req('R2_BACKUP_BUCKET');
const ENDPOINT = `https://${accountId}.r2.cloudflarestorage.com`;

function cliente(ak, sk) {
  return new S3Client({
    region: 'auto',
    endpoint: ENDPOINT,
    credentials: { accessKeyId: ak, secretAccessKey: sk },
    // R2 rejeita o checksum CRC32 automático do SDK v3 — desligamos (igual ao backend).
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

const src = cliente(req('R2_SRC_ACCESS_KEY_ID'), req('R2_SRC_SECRET_ACCESS_KEY'));
const dst = cliente(req('R2_DST_ACCESS_KEY_ID'), req('R2_DST_SECRET_ACCESS_KEY'));

// Lista TODAS as chaves de um bucket -> Map(key -> size).
async function indexar(s3, bucket, quem) {
  const mapa = new Map();
  let token;
  try {
    do {
      const r = await s3.send(
        new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token, MaxKeys: 1000 }),
      );
      for (const o of r.Contents ?? []) mapa.set(o.Key, o.Size ?? -1);
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
  } catch (e) {
    if (e.name === 'NoSuchBucket') {
      console.error(`\nBucket "${bucket}" (${quem}) nao existe. Crie-o no R2 e rode de novo.\n`);
      process.exit(2);
    }
    console.error(`Falha ao listar ${bucket} (${quem}): ${e.name} ${e.message}`);
    process.exit(3);
  }
  return mapa;
}

console.log(`Backup R2: ${origem}  ->  ${destino}`);

const mapaSrc = await indexar(src, origem, 'origem');
const mapaDst = await indexar(dst, destino, 'destino');
console.log(`Origem: ${mapaSrc.size} objetos | Backup atual: ${mapaDst.size} objetos`);

let copiados = 0;
let pulados = 0;
let erros = 0;

for (const [key, size] of mapaSrc) {
  if (mapaDst.get(key) === size) {
    pulados += 1;
    continue;
  }
  try {
    const obj = await src.send(new GetObjectCommand({ Bucket: origem, Key: key }));
    await dst.send(
      new PutObjectCommand({
        Bucket: destino,
        Key: key,
        Body: obj.Body,
        ContentType: obj.ContentType,
        ContentLength: obj.ContentLength,
      }),
    );
    copiados += 1;
    if (copiados % 50 === 0) console.log(`  copiados: ${copiados}...`);
  } catch (e) {
    erros += 1;
    console.error(`  ERRO ao copiar ${key}: ${e.name} ${e.message}`);
  }
}

console.log(`\nResultado: ${copiados} copiados, ${pulados} ja existiam, ${erros} erros.`);
if (erros > 0) process.exit(1);
