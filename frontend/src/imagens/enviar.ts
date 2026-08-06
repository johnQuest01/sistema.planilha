import { api } from '../api/cliente';
import { gerarDerivadas } from './derivadas';

// Precisa bater EXATAMENTE com CACHE_CONTROL_IMUTAVEL do backend (r2.ts): o
// presign assina o cache-control, então divergir aqui → 403 (SignatureDoesNotMatch).
const CACHE_CONTROL_IMUTAVEL = 'public, max-age=31536000, immutable';

async function putR2(url: string, blob: Blob): Promise<void> {
  // O presign assinou ContentType, ContentLength e CacheControl exatos: mandamos
  // JPEG com o tamanho do blob (o fetch põe o Content-Length sozinho) e o mesmo
  // cache-control assinado. Divergir daqui → 403 do R2.
  const resp = await fetch(url, {
    method: 'PUT',
    body: blob,
    headers: { 'content-type': 'image/jpeg', 'cache-control': CACHE_CONTROL_IMUTAVEL },
  });
  if (!resp.ok) throw new Error('falha ao enviar a foto');
}

// Fluxo da seção 6.1: gera as duas derivadas, pede os dois presign (key gerada pelo
// servidor), sobe as duas e devolve a KEY da cheia — quem chama faz o PATCH do registro.
export async function enviarFoto(registroId: string, file: File): Promise<string> {
  const { cheia, mini } = await gerarDerivadas(file);
  const { key, urlCheia, urlMini } = await api.presignUpload(registroId, {
    mime: 'image/jpeg',
    tamanhoCheia: cheia.size,
    tamanhoMini: mini.size,
  });
  await Promise.all([putR2(urlCheia, cheia), putR2(urlMini, mini)]);
  return key;
}
