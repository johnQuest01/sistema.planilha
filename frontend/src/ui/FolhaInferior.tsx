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
  // onFechar é recriado a cada render do pai (Ficha). Guardamos numa ref para o
  // efeito de montagem NÃO depender dele — senão ele re-executava a cada tecla,
  // chamando folhaRef.focus() e roubando o foco do input (no celular, fecha o teclado).
  const onFecharRef = useRef(onFechar);
  useEffect(() => {
    onFecharRef.current = onFechar;
  }, [onFechar]);

  // Só na montagem: trava o scroll do fundo, foca a folha uma vez e escuta Esc.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent): void {
      if (e.key === 'Escape') onFecharRef.current();
    }
    document.addEventListener('keydown', aoTeclar);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    folhaRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = anterior;
    };
  }, []);

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
