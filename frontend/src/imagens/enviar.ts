import { api } from '../api/cliente';
import { gerarDerivadas } from './derivadas';

async function putR2(url: string, blob: Blob): Promise<void> {
  // O presign assinou ContentType e ContentLength exatos: mandamos JPEG com o tamanho
  // do blob (o fetch põe o Content-Length sozinho). Divergir daqui → 403 do R2.
  const resp = await fetch(url, {
    method: 'PUT',
    body: blob,
    headers: { 'content-type': 'image/jpeg' },
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
