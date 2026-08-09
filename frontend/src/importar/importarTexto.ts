// Cria uma planilha a partir de um arquivo .zip com TEXTO + IMAGENS. Cada "nota"
// vira um registro (um card), na ordem em que foi escrita. Convenção do arquivo:
//   - Um .txt/.md dentro do .zip com o texto das notas.
//   - Separe cada nota com uma linha só com "---" (três traços). Sem "---", cada
//     bloco separado por linha em branco vira uma nota.
//   - Para anexar imagens a uma nota, escreva o nome do arquivo na sua ordem:
//     uma linha só com "4621.jpg", ou markdown "![](4621.jpg)", ou "![[4621.jpg]]".
//   - As imagens ficam soltas no .zip (o nome no texto casa com o arquivo).
import type { JSZipObject } from 'jszip';
import { api } from '../api/cliente';
import { enviarFoto } from '../imagens/enviar';
import { criarBlocoImagens } from './importarFotos';

const MAX_FOTOS = 30; // desejado (backend novo); cai para 10 no backend antigo

export interface NotaImportada {
  texto: string;
  imagens: File[];
}

function ehImagemNome(nome: string): boolean {
  return /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(nome);
}

function basename(caminho: string): string {
  return (caminho.split(/[/\\]/).pop() ?? caminho).trim();
}

function decodificar(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function mimeDe(nome: string): string {
  const ext = nome.toLowerCase().split('.').pop() ?? '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

// Quebra o texto em notas: por linhas "---" e, se não houver, por linhas em branco.
export function partirEmNotas(texto: string): string[] {
  const normal = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const porTraco = normal
    .split(/\n[ \t]*-{3,}[ \t]*\n/)
    .map((n) => n.trim())
    .filter((n) => n !== '');
  if (porTraco.length > 1) return porTraco;
  return normal
    .split(/\n[ \t]*\n+/)
    .map((n) => n.trim())
    .filter((n) => n !== '');
}

// Extrai o texto (sem as referências de imagem) e as imagens citadas, EM ORDEM.
function extrairNota(chunk: string, imagens: Map<string, JSZipObject>): {
  texto: string;
  refs: JSZipObject[];
} {
  const refs: JSZipObject[] = [];
  const usar = (nome: string): void => {
    const entry = imagens.get(basename(decodificar(nome)).toLowerCase());
    if (entry !== undefined) refs.push(entry);
  };
  const linhasTexto: string[] = [];
  for (const linha of chunk.split('\n')) {
    // Tira os tokens de imagem (markdown/obsidian) da linha, na ordem em que aparecem.
    const resto = linha.replace(/!\[\[([^\]]+)\]\]|!\[[^\]]*\]\(([^)]+)\)/g, (_m, a, b) => {
      usar((a ?? b ?? '') as string);
      return '';
    });
    const t = resto.trim();
    // Linha que é só o nome de uma imagem conhecida também vira anexo.
    if (t !== '' && imagens.has(basename(t).toLowerCase())) {
      usar(t);
      continue;
    }
    linhasTexto.push(resto);
  }
  return { texto: linhasTexto.join('\n').trim(), refs };
}

// Lê o .zip e devolve as notas na ordem do texto, com as imagens já como File.
export async function lerNotasDoZip(file: File): Promise<NotaImportada[]> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(file);

  const imagens = new Map<string, JSZipObject>();
  const textos: JSZipObject[] = [];
  zip.forEach((_caminho, entry) => {
    if (entry.dir) return;
    const nome = basename(entry.name);
    if (nome === '' || nome.startsWith('.') || entry.name.startsWith('__MACOSX')) return;
    if (ehImagemNome(nome)) imagens.set(nome.toLowerCase(), entry);
    else if (/\.(txt|md|markdown|text)$/i.test(nome)) textos.push(entry);
  });

  const arquivoTexto = textos[0];
  if (arquivoTexto === undefined) {
    throw new Error('O arquivo .zip precisa conter um arquivo de texto (.txt ou .md).');
  }

  const conteudo = await arquivoTexto.async('string');
  const chunks = partirEmNotas(conteudo);

  const notas: NotaImportada[] = [];
  for (const chunk of chunks) {
    const { texto, refs } = extrairNota(chunk, imagens);
    const arquivos: File[] = [];
    for (const entry of refs) {
      const blob = await entry.async('blob');
      arquivos.push(new File([blob], basename(entry.name), { type: mimeDe(entry.name) }));
    }
    if (texto === '' && arquivos.length === 0) continue; // nota vazia: ignora
    notas.push({ texto, imagens: arquivos });
  }
  return notas;
}

export interface ProgressoImportTexto {
  fase: 'lendo' | 'criando' | 'registros';
  feito: number;
  total: number;
}

// Fluxo completo: pede o nome ANTES (o chamador), cria a planilha, lê o .zip e cria
// os registros na ordem escrita (o 1º texto fica no topo da lista).
export async function importarPlanilhaDeZip(
  nome: string,
  file: File,
  aoProgresso?: (p: ProgressoImportTexto) => void,
): Promise<{ colecaoId: string; criados: number; total: number }> {
  aoProgresso?.({ fase: 'lendo', feito: 0, total: 0 });
  const notas = await lerNotasDoZip(file);
  if (notas.length === 0) {
    throw new Error('Não encontrei nenhuma nota no arquivo. Confira o texto e o separador "---".');
  }

  aoProgresso?.({ fase: 'criando', feito: 0, total: notas.length });
  const col = await api.criarColecao(nome);
  const blocoTexto = await api.criarCampo(col.id, { nome: 'Texto', tipo: 'paragrafo' });
  // Teto alto (backend novo) com fallback para 10 (backend antigo) — evita "validação".
  const blocoImagens = await criarBlocoImagens(col.id, 'Imagens', MAX_FOTOS);
  const maxFotos = blocoImagens.config.maxFotos ?? 10;

  // Cria em ordem INVERSA: como a lista é por `ordem` desc (mais novo no topo), criar
  // a última nota primeiro faz a PRIMEIRA nota escrita terminar no topo — preservando
  // a ordem em que foi escrita (de cima para baixo).
  let criados = 0;
  const total = notas.length;
  for (let i = notas.length - 1; i >= 0; i -= 1) {
    const nota = notas[i];
    if (nota === undefined) continue;
    const registro = await api.criarRegistro(col.id);
    const keys: string[] = [];
    for (const img of nota.imagens.slice(0, maxFotos)) {
      try {
        keys.push(await enviarFoto(registro.id, img));
      } catch {
        /* pula imagem que falhar no upload */
      }
    }
    const valores: Record<string, unknown> = {};
    if (nota.texto !== '') valores[blocoTexto.id] = nota.texto;
    if (keys.length > 0) valores[blocoImagens.id] = keys;
    if (Object.keys(valores).length > 0) await api.editarRegistro(registro.id, valores);
    criados += 1;
    aoProgresso?.({ fase: 'registros', feito: criados, total });
  }

  return { colecaoId: col.id, criados, total };
}
