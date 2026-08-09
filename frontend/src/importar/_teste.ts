import { removerOrdinais, partirEmBlocos, classificarBloco } from './criacaoAutomatica';
import { parseNomeArquivo, corDaFoto, secaoCor } from './importarFotos';
import type { Campo } from '../../../shared/tipos';

function log(label: string, val: unknown): void {
  console.log(label, JSON.stringify(val));
}

console.log('=== Test 1: classificarBloco ===');
for (const t of ['cor: rosa', '2 cor: rosa', 'cor rosa', 'cores: rosa, azul', 'COR: Rosa']) {
  const c = classificarBloco(t);
  log(`"${t}"`, { classe: c.classe, valor: c.valor, cores: c.cores });
}

console.log('\n=== Test 2: removerOrdinais + classes de um paste inteiro ===');
const pastes = [
  '1 4785. 2 cor: rosa. 3 observação',
  '1 4785\n2 cor: rosa\n3 observação',
  '1. 4785. 2. cor: rosa. 3. observação',
  '1) 4785 2) cor: rosa 3) observação',
  '4785. cor: rosa. observação',
];
for (const p of pastes) {
  const blocos = removerOrdinais(partirEmBlocos(p));
  log(`paste ${JSON.stringify(p)} -> blocos`, blocos);
  log('  classes', blocos.map((b) => `${classificarBloco(b).classe}(${classificarBloco(b).cores.join('|') || classificarBloco(b).valor})`));
}

console.log('\n=== Test 3: parseNomeArquivo ===');
for (const n of ['cor.rosa.png', 'rosa.png', '4785.cor.rosa.png', 'imagem.da.referencia.png']) {
  log(`"${n}"`, parseNomeArquivo(n));
}

console.log('\n=== Test 4: corDaFoto com secao Cor existente (linha rosa do texto) ===');
const secId = 's1';
const subCorId = 'c1';
const subFotoId = 'f1';
const corCampo: Campo = {
  id: secId,
  colecaoId: 'x',
  nome: 'Cor',
  tipo: 'secao',
  ordem: 0,
  config: {
    subcampos: [
      { id: subCorId, nome: 'Cor', tipo: 'texto', config: {} },
      { id: subFotoId, nome: 'Fotos', tipo: 'imagem', config: { maxFotos: 30 } },
    ],
  },
};
const campos = [corCampo];
const valores: Record<string, unknown> = { [secId]: [{ [subCorId]: 'rosa' }] };
const sc = secaoCor(campos);
log('secaoCor encontrada?', sc !== null);
log('corDaFoto(cor.rosa.png)', corDaFoto(parseNomeArquivo('cor.rosa.png'), sc, campos, valores));
// Simula o find de linha que o colocarCor faz:
const alvo = 'rosa';
const norm = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const linhas = valores[secId] as Record<string, unknown>[];
const achouLinha = linhas.find((l) => norm(String(l[subCorId] ?? '')) === norm(alvo)) !== undefined;
log('acha a linha rosa existente (nao duplica)?', achouLinha);
