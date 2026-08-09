// "Criação automático": cria uma planilha a partir de TEXTO colado (copia e cola)
// e, opcionalmente, de imagens selecionadas do celular. Cada nota (separada por
// "---" ou linha em branco) vira um registro, na ordem escrita.
//
// Casamento das imagens (inteligente pelo NOME):
//   1) Se o nome (sem extensão) é citado no texto de uma nota → entra naquela nota,
//      na ORDEM em que aparece no texto.
//   2) Senão, se o nome começa com um código (ex.: "4578sdskmdkm.png" → 4578) e esse
//      código aparece no texto de uma nota → entra naquela nota.
//   3) Senão (foto do celular com nome de data, sem casar) → fica EMBAIXO. Com uma
//      nota só, vai para ela; com várias, vai para a primeira (e avisamos).
import type { Registro } from '../../../shared/tipos';
import { api } from '../api/cliente';
import { enviarFoto } from '../imagens/enviar';
import { partirEmNotas } from './importarTexto';
import { criarBlocoImagens, refDoNome } from './importarFotos';

const MAX_FOTOS = 30;

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function stemDoNome(nome: string): string {
  return (nome.split(/[/\\]/).pop() ?? nome).replace(/\.[^.]+$/, '').trim();
}

export interface PlanoImagem {
  notaIdx: number; // índice da nota (registro) que recebe a imagem
  ordem: number; // posição da menção no texto (menor = antes); sem menção = grande
  casou: boolean; // true quando casou por menção/referência; false = fallback embaixo
}

// Decide, SÓ pelos nomes, para qual nota cada imagem vai e em que ordem. Pura (sem
// rede), para dar para testar. Regra: menção do nome no texto → referência numérica
// no texto → senão, 1ª nota (embaixo).
export function planejarDistribuicao(notas: string[], nomes: string[]): PlanoImagem[] {
  const notasNorm = notas.map((n) => normalizar(n));
  return nomes.map((nome, selIdx) => {
    const ref = refDoNome(nome);
    const stem = normalizar(stemDoNome(nome));
    let notaIdx = -1;
    let ordem = 1_000_000 + selIdx; // não mencionadas: ao fim, na ordem de seleção
    if (stem.length >= 2) {
      for (let i = 0; i < notasNorm.length; i += 1) {
        const pos = (notasNorm[i] ?? '').indexOf(stem);
        if (pos >= 0) {
          notaIdx = i;
          ordem = pos;
          break;
        }
      }
    }
    if (notaIdx < 0 && ref !== null) {
      for (let i = 0; i < notasNorm.length; i += 1) {
        if ((notasNorm[i] ?? '').includes(ref)) {
          notaIdx = i;
          break;
        }
      }
    }
    const casou = notaIdx >= 0;
    return { notaIdx: casou ? notaIdx : 0, ordem, casou };
  });
}

export interface ProgressoAuto {
  fase: 'criando' | 'imagens';
  feito: number;
  total: number;
}

export interface RelatorioAuto {
  registros: number;
  fotos: number;
  semReferencia: number; // fotos que não casaram (foram para o 1º registro, embaixo)
  excedente: number; // fotos que passaram do limite do bloco
}

export async function criarPlanilhaAutomatica(
  nome: string,
  texto: string,
  imagens: File[],
  aoProgresso?: (p: ProgressoAuto) => void,
): Promise<{ colecaoId: string; relatorio: RelatorioAuto }> {
  const notas = partirEmNotas(texto);
  if (notas.length === 0) throw new Error('Cole algum texto para criar os registros.');

  aoProgresso?.({ fase: 'criando', feito: 0, total: notas.length });
  const col = await api.criarColecao(nome);
  const blocoTexto = await api.criarCampo(col.id, { nome: 'Texto', tipo: 'paragrafo' });
  // Teto alto (backend novo) com fallback para 10 (backend antigo) — evita "validação".
  const blocoImagens = await criarBlocoImagens(col.id, 'Imagens', MAX_FOTOS);
  const maxFotos = blocoImagens.config.maxFotos ?? 10;

  // Cria em ordem INVERSA para a 1ª nota escrita ficar no topo (lista = ordem desc).
  const registros: Registro[] = new Array<Registro>(notas.length);
  for (let i = notas.length - 1; i >= 0; i -= 1) {
    const conteudo = notas[i] ?? '';
    const r = await api.criarRegistro(col.id, conteudo === '' ? {} : { [blocoTexto.id]: conteudo });
    registros[i] = r;
    aoProgresso?.({ fase: 'criando', feito: notas.length - i, total: notas.length });
  }

  // Decide a nota-alvo de cada imagem e a ordem dentro dela (lógica pura, testável).
  const plano = planejarDistribuicao(notas, imagens.map((f) => f.name));
  interface Alvo {
    notaIdx: number;
    ordem: number; // posição da menção no texto (menor = antes); sem menção = grande
    file: File;
  }
  const alvos: Alvo[] = [];
  let semRef = 0;
  imagens.forEach((file, selIdx) => {
    const p = plano[selIdx];
    if (p === undefined) return;
    if (!p.casou) semRef += 1;
    alvos.push({ notaIdx: p.notaIdx, ordem: p.ordem, file });
  });

  // Agrupa por nota e ordena dentro de cada uma (menção primeiro, na ordem do texto).
  const total = alvos.length;
  let feito = 0;
  let fotos = 0;
  let excedente = 0;
  aoProgresso?.({ fase: 'imagens', feito, total });

  for (let i = 0; i < notas.length; i += 1) {
    const doReg = alvos
      .filter((a) => a.notaIdx === i)
      .sort((a, b) => a.ordem - b.ordem);
    if (doReg.length === 0) continue;
    const registro = registros[i];
    if (registro === undefined) continue;

    const keys: string[] = [];
    for (const a of doReg) {
      if (keys.length >= maxFotos) {
        excedente += 1;
        feito += 1;
        aoProgresso?.({ fase: 'imagens', feito, total });
        continue;
      }
      try {
        keys.push(await enviarFoto(registro.id, a.file));
        fotos += 1;
      } catch {
        /* pula imagem que falhar no upload */
      }
      feito += 1;
      aoProgresso?.({ fase: 'imagens', feito, total });
    }
    if (keys.length > 0) await api.editarRegistro(registro.id, { [blocoImagens.id]: keys });
  }

  return {
    colecaoId: col.id,
    relatorio: { registros: notas.length, fotos, semReferencia: semRef, excedente },
  };
}

export function resumoAuto(rel: RelatorioAuto): string {
  const partes = [`${rel.registros} registro(s)`];
  if (rel.fotos > 0) partes.push(`${rel.fotos} foto(s)`);
  let base = `Criado: ${partes.join(', ')}.`;
  const avisos: string[] = [];
  if (rel.semReferencia > 0) avisos.push(`${rel.semReferencia} foto(s) sem referência foram para o 1º registro`);
  if (rel.excedente > 0) avisos.push(`${rel.excedente} foto(s) passaram do limite do bloco`);
  if (avisos.length > 0) base += ` (${avisos.join('; ')})`;
  return base;
}
