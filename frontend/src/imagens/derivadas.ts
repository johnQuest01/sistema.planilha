// Gera as DUAS derivadas da seção 6.1 no canvas, a partir do mesmo arquivo:
//  - cheia: lado maior 1600px, JPEG 0.8, teto 2 MB (visor)
//  - mini:  lado maior 240px,  JPEG 0.7, teto 200 KB (lista/célula/tiras)
// Sempre sai JPEG — por isso o mime enviado ao presign é image/jpeg.

const LADO_CHEIA = 1600;
const LADO_MINI = 240;
const MAX_CHEIA = 2 * 1024 * 1024;
const MAX_MINI = 200 * 1024;

export interface Derivadas {
  cheia: Blob;
  mini: Blob;
}

async function carregarBitmap(file: File): Promise<ImageBitmap> {
  // imageOrientation 'from-image' respeita o EXIF (foto de celular não vira de lado).
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

function desenhar(bitmap: ImageBitmap, ladoMax: number): HTMLCanvasElement {
  const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
  const largura = Math.max(1, Math.round(bitmap.width * escala));
  const altura = Math.max(1, Math.round(bitmap.height * escala));
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('canvas 2d indisponível');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, largura, altura);
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
  while (blob.size > limite && q > 0.4) {
    q -= 0.1;
    blob = await paraBlob(canvas, q);
  }
  return blob;
}

export async function gerarDerivadas(file: File): Promise<Derivadas> {
  const bitmap = await carregarBitmap(file);
  try {
    const cheia = await codificarAbaixoDe(desenhar(bitmap, LADO_CHEIA), MAX_CHEIA, 0.8);
    const mini = await codificarAbaixoDe(desenhar(bitmap, LADO_MINI), MAX_MINI, 0.7);
    return { cheia, mini };
  } finally {
    bitmap.close();
  }
}
