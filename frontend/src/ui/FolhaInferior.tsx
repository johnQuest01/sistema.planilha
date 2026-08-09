import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { travarScroll } from './travaScroll';
import './ui.css';

// Folha inferior modal (bottom sheet). O foco é aplicado apenas na montagem para
// não fechar o teclado do celular ao digitar (ver correção do efeito abaixo).

interface Props {
  titulo: string;
  subtitulo?: ReactNode;
  onFechar: () => void;
  children: ReactNode;
  acaoTopo?: ReactNode;
  /** Barra fixa no rodapé da folha (fora da área de rolagem). */
  rodape?: ReactNode;
  /** Folha ALTA (quase tela cheia) — usada nas prévias grandes (planilha unida). */
  alta?: boolean;
}

export function FolhaInferior({ titulo, subtitulo, onFechar, children, acaoTopo, rodape, alta }: Props): JSX.Element {
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
    const liberarScroll = travarScroll();
    folhaRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      liberarScroll();
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
        className={`folha${alta ? ' folha--alta' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        ref={folhaRef}
      >
        <div className="folha__topo">
          <button
            type="button"
            className="btn btn--icone folha__voltar"
            aria-label="Voltar"
            title="Voltar"
            onClick={onFechar}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="folha__tituloArea">
            <h2 className="folha__titulo">{titulo}</h2>
            {subtitulo !== undefined && <p className="folha__subtitulo">{subtitulo}</p>}
          </div>
          {acaoTopo}
          <button type="button" className="btn btn--icone" aria-label="Fechar" onClick={onFechar}>
            <X size={20} />
          </button>
        </div>
        <div className="folha__corpo">{children}</div>
        {rodape !== undefined && rodape !== null && <div className="folha__rodape">{rodape}</div>}
      </div>
    </div>
  );
}
