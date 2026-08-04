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

export function montarCompartilhamento(
  titulo: string,
  campos: Campo[],
  registro: Registro,
  selecionados: Set<string>,
): Compartilhavel {
  const linhas: string[] = [];
  const keys: string[] = [];
  if (titulo.trim() !== '') linhas.push(`*${titulo}*`);

  for (const campo of campos) {
    if (!selecionados.has(campo.id)) continue;

    if (campo.tipo === 'imagem') {
      for (const k of keysDoCampo(registro, campo.id)) keys.push(k);
      continue;
    }

    if (campo.tipo === 'secao') {
      for (const k of keysDeImagensDoCampo(campo, registro)) keys.push(k);
      const txt = montarTextoSecao(campo, registro);
      if (txt !== '') {
        linhas.push(`${campo.nome}:`);
        linhas.push(txt);
      }
      continue;
    }

    const v = formatarValor(campo, registro.valores[campo.id]).trim();
    if (v !== '') linhas.push(`${campo.nome}: ${v}`);
  }

  return { texto: linhas.join('\n'), keys };
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
