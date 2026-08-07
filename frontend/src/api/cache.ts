// Cache leve em localStorage para "stale-while-revalidate": mostra o ÚLTIMO dado
// conhecido na hora (sem esperar a rede) e revalida em segundo plano. Serve para o
// app parecer instantâneo ao reabrir/clicar numa planilha, mesmo quando o servidor
// está longe/lento. Guarda só payloads pequenos (detalhe da coleção e 1ª página de
// registros) — NUNCA imagens (essas já têm cache imutável de 1 ano no navegador,
// vindo do R2). É best-effort: se o storage falhar/encher, ignora sem quebrar nada.

const PREFIXO = 'mostruario:cache:v1:';
// SWR revalida sempre; esta validade só evita acumular lixo eterno no storage.
const VALIDADE_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias

interface Envelope<T> {
  t: number;
  v: T;
}

function chaveCompleta(chave: string): string {
  return PREFIXO + chave;
}

export function lerCache<T>(chave: string): T | null {
  try {
    const bruto = localStorage.getItem(chaveCompleta(chave));
    if (bruto === null) return null;
    const env = JSON.parse(bruto) as Envelope<T>;
    if (typeof env.t !== 'number' || Date.now() - env.t > VALIDADE_MS) return null;
    return env.v;
  } catch {
    return null;
  }
}

export function gravarCache<T>(chave: string, valor: T): void {
  try {
    const env: Envelope<T> = { t: Date.now(), v: valor };
    localStorage.setItem(chaveCompleta(chave), JSON.stringify(env));
  } catch {
    // Quota cheia ou storage indisponível: limpa o nosso namespace e segue.
    limparCache();
  }
}

// Some com tudo que gravamos (usar no logout, para não vazar dados entre contas).
export function limparCache(): void {
  try {
    const remover: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k !== null && k.startsWith(PREFIXO)) remover.push(k);
    }
    for (const k of remover) localStorage.removeItem(k);
  } catch {
    /* storage indisponível: nada a fazer */
  }
}

// Chaves centralizadas para não divergirem entre quem grava e quem lê.
export const chaveColecao = (id: string): string => `colecao:${id}`;
export const chaveRegistros = (id: string): string => `registros:${id}`;
// Planilha unificada (Oficina): snapshot da integração + coleções + registros crus,
// para reabrir instantâneo (SWR) sem re-paginar tudo de novo.
export const chaveIntegrado = (id: string): string => `integrado:${id}`;
