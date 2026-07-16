import { useEffect, useState } from 'react';

// Reage a uma media query. Usado pra alternar tabela (desktop) x lista densa (mobile),
// sem escrever largura fixa espalhada pelo código.
export function useMedia(consulta: string): boolean {
  const [combina, setCombina] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(consulta).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(consulta);
    const aoMudar = (): void => setCombina(mql.matches);
    aoMudar();
    mql.addEventListener('change', aoMudar);
    return () => mql.removeEventListener('change', aoMudar);
  }, [consulta]);

  return combina;
}
