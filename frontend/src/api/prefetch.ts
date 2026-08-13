// Prefetch das planilhas da Home: assim que a lista aparece, buscamos em segundo
// plano (quando o navegador está ocioso) o detalhe da coleção + a 1ª página de
// registros das primeiras planilhas e gravamos no cache. Quando o usuário clica,
// os dados já estão prontos — o clique fica instantâneo. É best-effort: erros
// (planilha protegida, rede) são ignorados; nada trava a Home.

import { api } from './cliente';
import { chaveColecao, chaveRegistros, gravarCache, lerCache } from './cache';

async function prefetchUma(id: string): Promise<void> {
  // Já em cache recente? evita rede à toa.
  if (lerCache(chaveColecao(id)) !== null && lerCache(chaveRegistros(id)) !== null) return;
  try {
    const [col, regs] = await Promise.all([api.obterColecao(id), api.listarRegistros(id)]);
    gravarCache(chaveColecao(id), col);
    gravarCache(chaveRegistros(id), regs);
  } catch {
    /* protegida/erro/rede: prefetch é best-effort */
  }
}

// Prefetch leve: poucas planilhas e 1 de cada vez, depois da Home estabilizar.
// Antes aquecia 6×2 e disputava banda com presença/auth — a lista parecia lenta.
export function prefetchColecoes(ids: string[], limite = 3, concorrencia = 1): void {
  const alvo = ids.slice(0, limite);
  if (alvo.length === 0) return;
  let i = 0;
  const trabalhar = async (): Promise<void> => {
    while (i < alvo.length) {
      const id = alvo[i];
      i += 1;
      if (id === undefined) break;
      await prefetchUma(id);
    }
  };
  const iniciar = (): void => {
    for (let c = 0; c < concorrencia; c += 1) void trabalhar();
  };
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void;
  };
  // Espera a Home pintar e o idle do browser; timeout evita nunca aquecer.
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(iniciar, { timeout: 2500 });
  } else {
    setTimeout(iniciar, 800);
  }
}
