import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import './ui.css';

interface Props {
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
  acaoTopo?: ReactNode;
}

export function FolhaInferior({ titulo, onFechar, children, acaoTopo }: Props): JSX.Element {
  const folhaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent): void {
      if (e.key === 'Escape') onFechar();
    }
    document.addEventListener('keydown', aoTeclar);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    folhaRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = anterior;
    };
  }, [onFechar]);

  return (
    <div
      className="folha__fundo"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div
        className="folha"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        ref={folhaRef}
      >
        <div className="folha__topo">
          <h2 className="folha__titulo">{titulo}</h2>
          {acaoTopo}
          <button type="button" className="btn btn--icone" aria-label="Fechar" onClick={onFechar}>
            <X size={20} />
          </button>
        </div>
        <div className="folha__corpo">{children}</div>
      </div>
    </div>
  );
}
