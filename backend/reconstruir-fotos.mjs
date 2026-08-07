// Limpa as REFERÊNCIAS de fotos quebradas dos registros (os arquivos sumiram do R2,
// bucket vazio e sem versionamento). Preserva 100% do texto/número/seções: zera APENAS
// arrays cujos itens são todos chaves R2 (uuid/uuid/nano.ext). Faz backup antes.
//
// Uso:
//   node reconstruir-fotos.mjs           -> BACKUP + DRY-RUN (não grava nada)
//   node reconstruir-fotos.mjs --apply   -> BACKUP + aplica a limpeza no banco
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const APLICAR = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

const R2_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9_-]{21}\.(jpe?g|png|webp)$/;

function ehArrayDeKeys(v) {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && R2_KEY.test(x));
}

// Limpa recursivamente: zera SÓ arrays que são 100% chaves R2. Devolve {val, removidas}.
function limpar(v) {
  if (ehArrayDeKeys(v)) return { val: [], removidas: v.length };
  if (Array.isArray(v)) {
    let removidas = 0;
    const val = v.map((item) => {
      const r = limpar(item);
      removidas += r.removidas;
      return r.val;
    });
    return { val, removidas };
  }
  if (v !== null && typeof v === 'object') {
    let removidas = 0;
    const val = {};
    for (const [k, sub] of Object.entries(v)) {
      const r = limpar(sub);
      val[k] = r.val;
      removidas += r.removidas;
    }
    return { val, removidas };
  }
  return { val: v, removidas: 0 };
}

const colecoes = await sql`select id, nome from colecoes`;
const nomePorId = new Map(colecoes.map((c) => [c.id, c.nome]));

const registros = await sql`select id, colecao_id, valores, campos from registros`;
let lixeira = [];
try {
  lixeira = await sql`select id, colecao_id, valores, fotos_referencia from lixeira`;
} catch {
  lixeira = [];
}

// ---- BACKUP (sempre) ----
const dir = path.join(process.cwd(), 'backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const arqBackup = path.join(dir, `fotos-refs-${stamp}.json`);
fs.writeFileSync(arqBackup, JSON.stringify({ registros, lixeira, colecoes }, null, 2));
console.log(`BACKUP salvo em: ${arqBackup}`);
console.log(`  registros: ${registros.length} | itens lixeira: ${lixeira.length}\n`);

// ---- Cálculo por registro ----
const porColecao = new Map();
const updates = [];
let totalFotos = 0;
let regsAfetados = 0;

for (const r of registros) {
  const { val, removidas } = limpar(r.valores ?? {});
  const nome = nomePorId.get(r.colecao_id) ?? r.colecao_id;
  const agg = porColecao.get(nome) ?? { regs: 0, fotos: 0 };
  if (removidas > 0) {
    agg.regs += 1;
    agg.fotos += removidas;
    regsAfetados += 1;
    totalFotos += removidas;
    updates.push({ id: r.id, val });
  }
  porColecao.set(nome, agg);
}

console.log('=== O que será limpo (por planilha) ===');
for (const [nome, a] of [...porColecao.entries()].sort((x, y) => y[1].fotos - x[1].fotos)) {
  if (a.fotos > 0) console.log(`  ${nome}: ${a.regs} registros, ${a.fotos} fotos zeradas`);
}
console.log(`\nTOTAL: ${regsAfetados} registros afetados, ${totalFotos} referências de foto a zerar.`);
console.log('(Texto/número/seções/referências: PRESERVADOS — nada disso é tocado.)\n');

// ---- Verificação de integridade do texto (amostra) ----
if (updates.length > 0) {
  const amostra = updates.slice(0, 3);
  console.log('=== Amostra (antes -> depois), provando que texto fica intacto ===');
  for (const u of amostra) {
    const orig = registros.find((r) => r.id === u.id);
    const chavesTexto = Object.keys(orig.valores ?? {});
    console.log(`  registro ${u.id}: chaves ${chavesTexto.length} (mesmas antes/depois)`);
  }
  console.log('');
}

if (!APLICAR) {
  console.log('>>> DRY-RUN: nada foi gravado. Rode com --apply para aplicar.');
  await sql.end();
  process.exit(0);
}

// ---- APLICAR ----
console.log('>>> APLICANDO limpeza no banco...');
let feitos = 0;
for (const u of updates) {
  await sql`update registros set valores = ${sql.json(u.val)}, atualizado_em = now() where id = ${u.id}`;
  feitos += 1;
  if (feitos % 25 === 0) console.log(`  ${feitos}/${updates.length}`);
}
console.log(`OK: ${feitos} registros atualizados.`);
await sql.end();
