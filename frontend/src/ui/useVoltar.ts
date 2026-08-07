import { useEffect, useRef } from 'react';

/**
 * Enquanto `aberto` for true, faz o botão VOLTAR (nativo do celular / do
 * navegador / gesto de voltar) FECHAR o modal em vez de sair da tela.
 *
 * Como: ao abrir, empurra uma entrada "sentinela" no histórico; o voltar nativo
 * dispara `popstate` → chamamos `aoFechar` (fecha o modal) e continuamos na mesma
 * tela (o registro/preenchimento fecha, sem voltar tudo para o início).
 *
 * Ao fechar pela UI (X, Esc, botão voltar da folha), consumimos a entrada
 * sentinela que empurramos — assim o próximo voltar nativo não precisa de 2
 * toques. Se a rota mudou (a sentinela não está mais no topo), não mexemos no
 * histórico, para não navegar sem querer.
 *
 * Dica: para telas com mais de um modal que se substituem (ex.: prévia → editar),
 * passe UM booleano só (`a !== null || b !== null`) e feche ambos no `aoFechar`.
 * Assim a troca entre eles não empurra/consome histórico à toa.
 */
export function useFecharAoVoltar(aberto: boolean, aoFechar: () => void): void {
  const aoFecharRef = useRef(aoFechar);
  aoFecharRef.current = aoFechar;

  useEffect(() => {
    if (!aberto) return;
    let fechadoPorVoltar = false;
    window.history.pushState({ modalMostruario: true }, '');
    const aoPopstate = (): void => {
      fechadoPorVoltar = true;
      aoFecharRef.current();
    };
    window.addEventListener('popstate', aoPopstate);
    return () => {
      window.removeEventListener('popstate', aoPopstate);
      const estado = window.history.state as { modalMostruario?: boolean } | null;
      if (!fechadoPorVoltar && estado?.modalMostruario === true) {
        window.history.back();
      }
    };
  }, [aberto]);
}
