import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as EventoTeclado } from 'react';
import { X } from 'lucide-react';
import { urlCheia, urlMini } from './urls';
import './imagens.css';

interface Props {
  keys: string[];
  indiceInicial: number;
  aoFechar: () => void;
}

// Visor da seção 6.2: o gesto é 100% CSS scroll-snap (ver imagens.css). Aqui o JS só
// sincroniza — índice ativo por IntersectionObserver, navegação por scrollIntoView,
// teclado e A11y. Nada de touchstart/move/end.
export function Visor({ keys, indiceInicial, aoFechar }: Props): JSX.Element {
  const trilhoRef = useRef<HTMLDivElement>(null);
  const quadrosRef = useRef<(HTMLDivElement | null)[]>([]);
  const dialogoRef = useRef<HTMLDivElement>(null);
  const [ativo, setAtivo] = useState(indiceInicial);

  const irPara = useCallback((i: number, comportamento: ScrollBehavior) => {
    const alvo = quadrosRef.current[i];
    if (alvo !== null && alvo !== undefined) {
      alvo.scrollIntoView({ behavior: comportamento, inline: 'center', block: 'nearest' });
    }
  }, []);

  // Foco preso no visor; devolvido à origem (miniatura) ao fechar.
  useEffect(() => {
    const origem = document.activeElement as HTMLElement | null;
    dialogoRef.current?.focus();
    const corpoAntes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = corpoAntes;
      origem?.focus?.();
    };
  }, []);

  // Posiciona no índice inicial sem animação, depois da montagem.
  useEffect(() => {
    irPara(indiceInicial, 'auto');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Índice ativo via IntersectionObserver (não via cálculo de offset no scroll).
  useEffect(() => {
    const trilho = trilhoRef.current;
    if (trilho === null) return;
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) {
            const i = quadrosRef.current.indexOf(e.target as HTMLDivElement);
            if (i >= 0) setAtivo(i);
          }
        }
      },
      { root: trilho, threshold: 0.6 },
    );
    for (const q of quadrosRef.current) if (q !== null) obs.observe(q);
    return () => obs.disconnect();
  }, [keys.length]);

  // Centraliza a tira ativa na régua de baixo.
  useEffect(() => {
    const tira = document.getElementById(`tira-${ativo}`);
    tira?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [ativo]);

  function aoTeclar(e: EventoTeclado): void {
    if (e.key === 'Escape') aoFechar();
    else if (e.key === 'ArrowRight') irPara(Math.min(ativo + 1, keys.length - 1), 'smooth');
    else if (e.key === 'ArrowLeft') irPara(Math.max(ativo - 1, 0), 'smooth');
  }

  return (
    <div
      className="visor"
      role="dialog"
      aria-modal="true"
      aria-label="Visualizador de fotos"
      tabIndex={-1}
      ref={dialogoRef}
      onKeyDown={aoTeclar}
    >
      <div className="visor__topo">
        <span className="visor__contador">
          {ativo + 1} / {keys.length}
        </span>
        <button type="button" className="visor__fechar" aria-label="Fechar" onClick={aoFechar}>
          <X size={22} />
        </button>
      </div>

      <div className="trilho" ref={trilhoRef}>
        {keys.map((k, i) => (
          <div
            key={k}
            className="quadro"
            ref={(el) => {
              quadrosRef.current[i] = el;
            }}
          >
            <img src={urlCheia(k)} alt={`Foto ${i + 1}`} loading="lazy" />
          </div>
        ))}
      </div>

      {keys.length > 1 && (
        <div className="tiras">
          {keys.map((k, i) => (
            <button
              key={k}
              id={`tira-${i}`}
              type="button"
              className={`tira${i === ativo ? ' on' : ''}`}
              style={{ backgroundImage: `url(${urlMini(k)})` }}
              aria-label={`Ir para a foto ${i + 1}`}
              onClick={() => irPara(i, 'smooth')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
