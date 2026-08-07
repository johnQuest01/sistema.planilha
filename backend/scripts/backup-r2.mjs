// Backup INCREMENTAL e SÓ-ADIÇÃO do bucket de fotos do R2 para um bucket de backup.
// - Copia server-side (dentro do próprio R2, sem baixar/subir) tudo que ainda não
//   existe no backup (ou que mudou de tamanho).
// - NUNCA apaga nada do backup: mesmo que o bucket principal seja esvaziado por engano,
//   o backup preserva o histórico. É essa a proteção contra o que aconteceu.
//
// Roda no GitHub Actions (diário) e também dá pra rodar na mão:
//   node scripts/backup-r2.mjs
//
// Variáveis (env):
//   R2_ACCOUNT_ID          conta Cloudflare (o hash do endpoint)
//   R2_ACCESS_KEY_ID       token com Object Read&Write nos DOIS buckets
//   R2_SECRET_ACCESS_KEY
//   R2_BUCKET              origem   (default: mostruario-midia)
//   R2_BACKUP_BUCKET       destino  (default: mostruario-midia-backup)
import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';

const accountId = req('R2_ACCOUNT_ID');
const origem = process.env.R2_BUCKET?.trim() || 'mostruario-midia';
const destino = process.env.R2_BACKUP_BUCKET?.trim() || 'mostruario-midia-backup';

function req(nome) {
  const v = process.env[nome];
  if (!v || v.trim() === '') {
    console.error(`Falta a variável de ambiente: ${nome}`);
    process.exit(1);
  }
  return v.trim();
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: req('R2_ACCESS_KEY_ID'),
    secretAccessKey: req('R2_SECRET_ACCESS_KEY'),
  },
  // R2 rejeita o checksum CRC32 automático do SDK v3 — desligamos (igual ao backend).
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

// Lista TODAS as chaves de um bucket -> Map(key -> size). Se o bucket não existe, avisa.
async function indexar(bucket) {
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
      console.error(
        `\nO bucket de destino "${bucket}" não existe. Crie-o no painel do R2 ` +
          `(Overview -> Create bucket) com esse nome e rode de novo.\n`,
      );
      process.exit(2);
    }
    throw e;
  }
  return mapa;
}

console.log(`Backup R2: ${origem}  ->  ${destino}`);

const src = await indexar(origem);
const dst = await indexar(destino);
console.log(`Origem: ${src.size} objetos | Backup atual: ${dst.size} objetos`);

let copiados = 0;
let pulados = 0;
let erros = 0;

for (const [key, size] of src) {
  const jaTem = dst.get(key);
  if (jaTem !== undefined && jaTem === size) {
    pulados += 1;
    continue;
  }
  try {
    // CopySource = "<bucket>/<key>". Barras da key são separador de caminho (não codificar);
    // os demais caracteres das nossas keys (uuid/uuid/nano_t.ext) são seguros.
    await s3.send(
      new CopyObjectCommand({
        Bucket: destino,
        Key: key,
        CopySource: `${origem}/${key}`,
      }),
    );
    copiados += 1;
    if (copiados % 50 === 0) console.log(`  copiados: ${copiados}...`);
  } catch (e) {
    erros += 1;
    console.error(`  ERRO ao copiar ${key}: ${e.name} ${e.message}`);
  }
}

console.log(`\nResultado: ${copiados} copiados, ${pulados} já existiam, ${erros} erros.`);
console.log(`Backup agora tem >= ${dst.size + copiados} objetos.`);
if (erros > 0) process.exit(1);
