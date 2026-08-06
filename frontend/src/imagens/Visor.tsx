import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as EventoTeclado } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import { FotoZoomavel } from './FotoZoomavel';
import { urlCheia, urlMini } from './urls';
import { travarScroll } from '../ui/travaScroll';
import './imagens.css';

interface Props {
  keys: string[];
  indiceInicial: number;
  aoFechar: () => void;
}

// iPhone/iPad (inclui iPad que se identifica como "MacIntel" com toque). No iOS o
// atributo download não salva o arquivo; abrir em nova aba é o caminho confiável.
function ehIOS(): boolean {
  const nav = navigator;
  return (
    /iP(hone|ad|od)/.test(nav.userAgent) ||
    (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  );
}

// Portal no body: se ficar dentro da FolhaInferior, overflow/stacking esconde a foto.
export function Visor({ keys, indiceInicial, aoFechar }: Props): JSX.Element {
  const trilhoRef = useRef<HTMLDivElement>(null);
  const quadrosRef = useRef<(HTMLDivElement | null)[]>([]);
  const dialogoRef = useRef<HTMLDivElement>(null);
  const [ativo, setAtivo] = useState(indiceInicial);
  const [zoomAtivo, setZoomAtivo] = useState(false);
  const [baixando, setBaixando] = useState(false);

  // Baixa a foto ATUAL em alta resolução (a "cheia" do R2). No iPhone/iOS o
  // atributo `download` é ignorado, então abrimos a imagem numa aba nova para o
  // usuário segurar o dedo e usar "Salvar em Fotos". Nos demais, busca como blob
  // e força o download; se falhar (rede/CORS), cai no mesmo abrir-em-nova-aba.
  const baixar = useCallback(async (): Promise<void> => {
    const key = keys[ativo];
    if (key === undefined || baixando) return;
    const url = urlCheia(key);
    const nome = key.split('/').pop() ?? 'foto.jpg';

    if (ehIOS()) {
      window.open(url, '_blank', 'noopener');
      return;
    }

    setBaixando(true);
    try {
      const resp = await fetch(url, { mode: 'cors' });
      if (!resp.ok) throw new Error('falha ao baixar');
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch {
      window.open(url, '_blank', 'noopener');
    } finally {
      setBaixando(false);
    }
  }, [ativo, keys, baixando]);

  const irPara = useCallback((i: number, comportamento: ScrollBehavior) => {
    const alvo = quadrosRef.current[i];
    if (alvo !== null && alvo !== undefined) {
      alvo.scrollIntoView({ behavior: comportamento, inline: 'center', block: 'nearest' });
    }
  }, []);

  useEffect(() => {
    const origem = document.activeElement as HTMLElement | null;
    dialogoRef.current?.focus();
    const liberarScroll = travarScroll();
    return () => {
      liberarScroll();
      origem?.focus?.();
    };
  }, []);

  useEffect(() => {
    irPara(indiceInicial, 'auto');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    const tira = document.getElementById(`tira-${ativo}`);
    tira?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [ativo]);

  useEffect(() => {
    setZoomAtivo(false);
  }, [ativo]);

  function aoTeclar(e: EventoTeclado): void {
    if (e.key === 'Escape') aoFechar();
    else if (e.key === 'ArrowRight' && !zoomAtivo) {
      irPara(Math.min(ativo + 1, keys.length - 1), 'smooth');
    } else if (e.key === 'ArrowLeft' && !zoomAtivo) {
      irPara(Math.max(ativo - 1, 0), 'smooth');
    }
  }

  const marcarZoom = useCallback((z: boolean) => {
    setZoomAtivo(z);
  }, []);

  const aoDeslizar = useCallback(
    (dir: -1 | 1) => {
      if (zoomAtivo) return;
      irPara(Math.min(Math.max(ativo + dir, 0), keys.length - 1), 'smooth');
    },
    [zoomAtivo, ativo, keys.length, irPara],
  );

  const ui = (
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
          {zoomAtivo ? ' · arraste para mover' : ''}
        </span>
        <div className="visor__acoes">
          <button
            type="button"
            className="visor__baixar"
            aria-label="Baixar imagem em alta resolução"
            title="Baixar imagem em alta resolução"
            disabled={baixando}
            onClick={() => void baixar()}
          >
            <Download size={20} />
            <span className="visor__baixar-txt">{baixando ? 'Baixando…' : 'Baixar foto'}</span>
          </button>
          <button type="button" className="visor__fechar" aria-label="Fechar" onClick={aoFechar}>
            <X size={22} />
          </button>
        </div>
      </div>

      <div className={`trilho${zoomAtivo ? ' trilho--travado' : ''}`} ref={trilhoRef}>
        {keys.map((k, i) => {
          const vizinha = Math.abs(i - ativo) <= 1;
          return (
            <div
              key={k}
              className="quadro"
              ref={(el) => {
                quadrosRef.current[i] = el;
              }}
            >
              <FotoZoomavel
                srcMini={urlMini(k)}
                srcCheia={urlCheia(k)}
                alt={`Foto ${i + 1}`}
                carregarCheia={vizinha}
                aoZoomAtivo={i === ativo ? marcarZoom : undefined}
                aoDeslizar={i === ativo ? aoDeslizar : undefined}
              />
            </div>
          );
        })}
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
              disabled={zoomAtivo}
              onClick={() => irPara(i, 'smooth')}
            />
          ))}
        </div>
      )}
    </div>
  );

  return createPortal(ui, document.body);
}
