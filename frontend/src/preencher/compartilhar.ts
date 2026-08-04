import type { Campo, Registro } from '../../../shared/tipos';
import { urlCheia } from '../imagens/urls';
import { formatarValor, keysDeImagensDoCampo, keysDoCampo } from './derivarResumo';
import { linhasDe } from './SecaoEditor';

// Monta, a partir dos campos SELECIONADOS na prévia, o texto (no mesmo formato da
// prévia: "Nome: valor", seções por linha) e as KEYS das imagens em alta resolução.

export interface Compartilhavel {
  texto: string;
  keys: string[];
}

// Um campo tem conteúdo? (para pré-selecionar só o que está preenchido)
export function campoTemConteudo(campo: Campo, registro: Registro): boolean {
  if (campo.tipo === 'imagem') return keysDoCampo(registro, campo.id).length > 0;
  if (campo.tipo === 'secao') {
    return keysDeImagensDoCampo(campo, registro).length > 0 || montarTextoSecao(campo, registro) !== '';
  }
  return formatarValor(campo, registro.valores[campo.id]).trim() !== '';
}

function montarTextoSecao(campo: Campo, registro: Registro): string {
  const subs = (campo.config.subcampos ?? []).filter((s) => s.tipo !== 'imagem');
  const linhas = linhasDe(registro.valores[campo.id]);
  const partes: string[] = [];
  linhas.forEach((linha, i) => {
    const celulas = subs
      .map((s) => {
        const v = formatarValor({ tipo: s.tipo, config: s.config }, linha[s.id]).trim();
        return v === '' ? '' : `${s.nome}: ${v}`;
      })
      .filter((c) => c !== '');
    if (celulas.length > 0) partes.push(`  #${i + 1} ${celulas.join(' · ')}`);
  });
  return partes.join('\n');
}

function rotuloFotos(qtd: number): string {
  return `${qtd} ${qtd === 1 ? 'foto' : 'fotos'}`;
}

export function montarCompartilhamento(
  titulo: string,
  campos: Campo[],
  registro: Registro,
  selecionados: Set<string>,
): Compartilhavel {
  // Cada "bloco" e uma informacao. Percorremos os campos na MESMA ordem da previa
  // (referencia -> foto -> cor -> foto ...) e no fim juntamos com linha em branco
  // entre os blocos, para o texto nao ficar tudo grudado.
  const blocos: string[] = [];
  const keys: string[] = [];
  if (titulo.trim() !== '') blocos.push(`*${titulo}*`);

  for (const campo of campos) {
    if (!selecionados.has(campo.id)) continue;

    if (campo.tipo === 'imagem') {
      const ks = keysDoCampo(registro, campo.id);
      if (ks.length === 0) continue;
      for (const k of ks) keys.push(k);
      // Rotula a imagem na ordem certa (a foto em si vai anexada em alta resolucao).
      blocos.push(`${campo.nome}: ${rotuloFotos(ks.length)}`);
      continue;
    }

    if (campo.tipo === 'secao') {
      const ksSecao = keysDeImagensDoCampo(campo, registro);
      for (const k of ksSecao) keys.push(k);
      const txt = montarTextoSecao(campo, registro);
      const partes: string[] = [];
      if (txt !== '') partes.push(txt);
      if (ksSecao.length > 0) partes.push(rotuloFotos(ksSecao.length));
      if (partes.length > 0) blocos.push(`${campo.nome}:\n${partes.join('\n')}`);
      continue;
    }

    const v = formatarValor(campo, registro.valores[campo.id]).trim();
    if (v !== '') blocos.push(`${campo.nome}: ${v}`);
  }

  return { texto: blocos.join('\n\n'), keys };
}

// ---- Compositor: monta UMA imagem do registro na ORDEM da prévia ----
// A Web Share API não intercala texto e várias fotos (texto vira um bloco e as
// fotos viram anexos soltos). Para sair "campo → foto → campo → foto" na ordem
// certa, desenhamos tudo num único <canvas> e compartilhamos essa imagem.

type ItemImg =
  | { k: 'titulo'; texto: string }
  | { k: 'rotulo'; texto: string }
  | { k: 'texto'; texto: string }
  | { k: 'foto'; key: string };

function itensNaOrdem(
  titulo: string,
  campos: Campo[],
  registro: Registro,
  selecionados: Set<string>,
): ItemImg[] {
  const itens: ItemImg[] = [];
  if (titulo.trim() !== '') itens.push({ k: 'titulo', texto: titulo });

  for (const campo of campos) {
    if (!selecionados.has(campo.id)) continue;

    if (campo.tipo === 'imagem') {
      const ks = keysDoCampo(registro, campo.id);
      if (ks.length === 0) continue;
      itens.push({ k: 'rotulo', texto: campo.nome });
      for (const key of ks) itens.push({ k: 'foto', key });
      continue;
    }

    if (campo.tipo === 'secao') {
      const subs = campo.config.subcampos ?? [];
      const subsTxt = subs.filter((s) => s.tipo !== 'imagem');
      const subsImg = subs.filter((s) => s.tipo === 'imagem');
      const linhas = linhasDe(registro.valores[campo.id]);
      let cabecalho = false;
      for (const linha of linhas) {
        const cel = subsTxt
          .map((s) => {
            const v = formatarValor({ tipo: s.tipo, config: s.config }, linha[s.id]).trim();
            return v === '' ? '' : `${s.nome}: ${v}`;
          })
          .filter((c) => c !== '');
        const fotosLinha: string[] = [];
        for (const s of subsImg) {
          const v = linha[s.id];
          if (Array.isArray(v)) for (const k of v) if (typeof k === 'string') fotosLinha.push(k);
        }
        if (cel.length === 0 && fotosLinha.length === 0) continue;
        if (!cabecalho) {
          itens.push({ k: 'rotulo', texto: campo.nome });
          cabecalho = true;
        }
        if (cel.length > 0) itens.push({ k: 'texto', texto: cel.join('   ·   ') });
        for (const key of fotosLinha) itens.push({ k: 'foto', key });
      }
      continue;
    }

    const v = formatarValor(campo, registro.valores[campo.id]).trim();
    if (v !== '') itens.push({ k: 'texto', texto: `${campo.nome}: ${v}` });
  }

  return itens;
}

function quebrarTexto(ctx: CanvasRenderingContext2D, texto: string, maxW: number): string[] {
  const saida: string[] = [];
  for (const paragrafo of texto.split('\n')) {
    const palavras = paragrafo.split(' ');
    let atual = '';
    for (const p of palavras) {
      const tent = atual === '' ? p : `${atual} ${p}`;
      if (ctx.measureText(tent).width > maxW && atual !== '') {
        saida.push(atual);
        atual = p;
      } else {
        atual = tent;
      }
    }
    saida.push(atual);
  }
  return saida;
}

async function carregarBitmap(key: string): Promise<ImageBitmap | null> {
  try {
    if (typeof createImageBitmap !== 'function') return null;
    const resp = await fetch(urlCheia(key), { mode: 'cors' });
    if (!resp.ok) return null;
    return await createImageBitmap(await resp.blob());
  } catch {
    return null;
  }
}

export async function gerarImagemRegistro(
  titulo: string,
  campos: Campo[],
  registro: Registro,
  selecionados: Set<string>,
): Promise<File | null> {
  if (typeof document === 'undefined') return null;
  const itens = itensNaOrdem(titulo, campos, registro, selecionados);
  if (itens.length === 0) return null;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;

  const LARGURA = 1080;
  const M = 44; // margem
  const W = LARGURA - M * 2;
  const GAP = 20;
  const MAXH_FOTO = 1200;
  const FONTE = {
    titulo: '700 46px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    rotulo: '700 32px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    texto: '400 31px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  };
  const LH = { titulo: 58, rotulo: 44, texto: 42 };

  // Carrega os bitmaps na ordem, respeitando o limite de fotos.
  const bitmaps = new Map<number, ImageBitmap>();
  let nFotos = 0;
  for (let i = 0; i < itens.length; i++) {
    const it = itens[i];
    if (it === undefined || it.k !== 'foto') continue;
    if (nFotos >= MAX_IMAGENS) break;
    const bmp = await carregarBitmap(it.key);
    if (bmp !== null) {
      bitmaps.set(i, bmp);
      nFotos++;
    }
  }

  interface Plano {
    k: ItemImg['k'];
    linhas?: string[];
    font?: string;
    lh?: number;
    cor?: string;
    bmp?: ImageBitmap;
    dw?: number;
    dh?: number;
    altura: number;
  }

  const plano: Plano[] = [];
  let total = M * 2;
  for (let i = 0; i < itens.length; i++) {
    const it = itens[i];
    if (it === undefined) continue;
    if (it.k === 'foto') {
      const bmp = bitmaps.get(i);
      if (bmp === undefined) continue;
      let dw = W;
      let dh = bmp.height * (W / bmp.width);
      if (dh > MAXH_FOTO) {
        dh = MAXH_FOTO;
        dw = bmp.width * (MAXH_FOTO / bmp.height);
      }
      plano.push({ k: 'foto', bmp, dw, dh, altura: dh });
      total += dh + GAP;
      continue;
    }
    const font = it.k === 'titulo' ? FONTE.titulo : it.k === 'rotulo' ? FONTE.rotulo : FONTE.texto;
    const lh = it.k === 'titulo' ? LH.titulo : it.k === 'rotulo' ? LH.rotulo : LH.texto;
    const cor = it.k === 'titulo' ? '#111827' : it.k === 'rotulo' ? '#b45309' : '#1f2937';
    ctx.font = font;
    const linhas = quebrarTexto(ctx, it.texto, W);
    const altura = linhas.length * lh;
    plano.push({ k: it.k, linhas, font, lh, cor, altura });
    total += altura + GAP;
  }

  canvas.width = LARGURA;
  canvas.height = Math.min(Math.ceil(total), 30000);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'top';

  let y = M;
  for (const p of plano) {
    if (p.k === 'foto' && p.bmp !== undefined && p.dw !== undefined && p.dh !== undefined) {
      const x = M + (W - p.dw) / 2;
      ctx.drawImage(p.bmp, x, y, p.dw, p.dh);
      y += p.dh + GAP;
      continue;
    }
    if (p.linhas !== undefined && p.font !== undefined && p.lh !== undefined) {
      ctx.font = p.font;
      ctx.fillStyle = p.cor ?? '#1f2937';
      for (const ln of p.linhas) {
        ctx.fillText(ln, M, y);
        y += p.lh;
      }
      y += GAP;
    }
  }

  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob((b) => res(b), 'image/jpeg', 0.9),
  );
  if (blob === null) return null;
  return new File([blob], 'registro.jpg', { type: 'image/jpeg' });
}

// ---- Envio via Web Share API (WhatsApp etc.), sem baixar nada ----

const MAX_IMAGENS = 10; // WhatsApp/iOS limita a quantidade por compartilhamento

export type ResultadoShare = 'ok' | 'so-texto' | 'cancelado' | 'sem-suporte' | 'erro';

function nomeArquivo(key: string, i: number): string {
  const base = key.split('/').pop();
  return base !== undefined && base !== '' ? base : `foto-${i + 1}.jpg`;
}

async function keyParaArquivo(key: string, i: number): Promise<File | null> {
  try {
    const resp = await fetch(urlCheia(key), { mode: 'cors' });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const tipo = blob.type !== '' ? blob.type : 'image/jpeg';
    return new File([blob], nomeArquivo(key, i), { type: tipo });
  } catch {
    return null;
  }
}

export async function compartilhar(
  titulo: string,
  texto: string,
  keys: string[],
): Promise<ResultadoShare> {
  if (typeof navigator.share !== 'function') return 'sem-suporte';

  const arquivos: File[] = [];
  for (let i = 0; i < Math.min(keys.length, MAX_IMAGENS); i++) {
    const k = keys[i];
    if (k === undefined) continue;
    const f = await keyParaArquivo(k, i);
    if (f !== null) arquivos.push(f);
  }

  const dadosComFotos: ShareData = { title: titulo, text: texto, files: arquivos };
  const temSuporteArquivos =
    arquivos.length > 0 &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare(dadosComFotos);

  try {
    if (temSuporteArquivos) {
      await navigator.share(dadosComFotos);
      return 'ok';
    }
    // Navegador não anexa arquivos (ex.: desktop): compartilha só o texto.
    await navigator.share({ title: titulo, text: texto });
    return keys.length > 0 ? 'so-texto' : 'ok';
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelado';
    return 'erro';
  }
}

// Compartilha o registro como UMA imagem montada na ordem da prévia (campo → foto
// → campo → foto). Se o dispositivo não anexar arquivos, cai para só o texto.
export async function compartilharRegistro(
  titulo: string,
  campos: Campo[],
  registro: Registro,
  selecionados: Set<string>,
): Promise<ResultadoShare> {
  if (typeof navigator.share !== 'function') return 'sem-suporte';

  const { texto } = montarCompartilhamento(titulo, campos, registro, selecionados);
  const imagem = await gerarImagemRegistro(titulo, campos, registro, selecionados);

  if (imagem !== null) {
    const dados: ShareData = { title: titulo, text: titulo, files: [imagem] };
    if (typeof navigator.canShare === 'function' && navigator.canShare(dados)) {
      try {
        await navigator.share(dados);
        return 'ok';
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return 'cancelado';
        return 'erro';
      }
    }
  }

  // Sem suporte a anexar imagem: manda o texto (na ordem, com espaçamento).
  try {
    await navigator.share({ title: titulo, text: texto });
    return 'so-texto';
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelado';
    return 'erro';
  }
}
