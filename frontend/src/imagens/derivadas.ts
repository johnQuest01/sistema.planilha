// Gera as DUAS derivadas da seção 6.1 no canvas, a partir do mesmo arquivo:
//  - cheia: lado maior 2560px, JPEG ~0.88, teto 4 MB (visor + zoom com detalhe)
//  - mini:  lado maior 240px,  JPEG 0.7, teto 200 KB (lista/célula/tiras)
// Sempre sai JPEG — por isso o mime enviado ao presign é image/jpeg.

const LADO_CHEIA = 2560;
const LADO_MINI = 240;
const MAX_CHEIA = 4 * 1024 * 1024;
const MAX_MINI = 200 * 1024;

export interface Derivadas {
  cheia: Blob;
  mini: Blob;
}

// Fonte desenhável: ImageBitmap (rápido) ou HTMLImageElement (fallback). Guardamos
// as dimensões porque ImageBitmap e HTMLImageElement expõem width/height igual.
interface FonteImagem {
  fonte: CanvasImageSource;
  largura: number;
  altura: number;
  fechar: () => void;
}

// Fallback quando createImageBitmap falha (alguns navegadores/formatos): carrega via
// <img> a partir de um object URL. Sem isso, a foto sumia em silêncio no upload.
async function carregarViaImg(file: File): Promise<FonteImagem> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolver, rejeitar) => {
      img.onload = () => resolver();
      img.onerror = () => rejeitar(new Error('não foi possível ler a imagem'));
      img.src = url;
    });
    const largura = img.naturalWidth || img.width;
    const altura = img.naturalHeight || img.height;
    if (largura === 0 || altura === 0) throw new Error('imagem com dimensões inválidas');
    return { fonte: img, largura, altura, fechar: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

async function carregarFonte(file: File): Promise<FonteImagem> {
  // imageOrientation 'from-image' respeita o EXIF (foto de celular não vira de lado).
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { fonte: bitmap, largura: bitmap.width, altura: bitmap.height, fechar: () => bitmap.close() };
  } catch {
    return carregarViaImg(file);
  }
}

function desenhar(fonte: FonteImagem, ladoMax: number): HTMLCanvasElement {
  const escala = Math.min(1, ladoMax / Math.max(fonte.largura, fonte.altura));
  const largura = Math.max(1, Math.round(fonte.largura * escala));
  const altura = Math.max(1, Math.round(fonte.altura * escala));
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('canvas 2d indisponível');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fonte.fonte, 0, 0, largura, altura);
  return canvas;
}

function paraBlob(canvas: HTMLCanvasElement, qualidade: number): Promise<Blob> {
  return new Promise((resolver, rejeitar) => {
    canvas.toBlob(
      (b) => (b === null ? rejeitar(new Error('falha ao codificar JPEG')) : resolver(b)),
      'image/jpeg',
      qualidade,
    );
  });
}

// Reduz a qualidade em passos até caber no teto (raro precisar). Devolve o menor
// que couber, ou o último tentado se nada couber.
async function codificarAbaixoDe(
  canvas: HTMLCanvasElement,
  limite: number,
  qInicial: number,
): Promise<Blob> {
  let q = qInicial;
  let blob = await paraBlob(canvas, q);
  while (blob.size > limite && q > 0.5) {
    q -= 0.08;
    blob = await paraBlob(canvas, q);
  }
  return blob;
}

export async function gerarDerivadas(file: File): Promise<Derivadas> {
  const fonte = await carregarFonte(file);
  try {
    const cheia = await codificarAbaixoDe(desenhar(fonte, LADO_CHEIA), MAX_CHEIA, 0.88);
    const mini = await codificarAbaixoDe(desenhar(fonte, LADO_MINI), MAX_MINI, 0.7);
    return { cheia, mini };
  } finally {
    fonte.fechar();
  }
}
