import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as EventoPointer, WheelEvent as EventoRoda, MouseEvent as EventoMouse } from 'react';

interface Props {
  srcMini: string;
  srcCheia: string;
  alt: string;
  /** Só carrega a cheia quando true (ativo + vizinhos). */
  carregarCheia: boolean;
  /** Avisa o pai quando está com zoom (>1) — trava o scroll do trilho. */
  aoZoomAtivo?: (ativo: boolean) => void;
  /** Swipe horizontal com scale=1 → troca de foto no trilho. */
  aoDeslizar?: (dir: -1 | 1) => void;
}

const MIN = 1;
const DUPLO_MS = 280;

function limitar(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n));
}

function distancia(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Zoom por TAMANHO real da bitmap (não CSS scale em img já encolhida).
 * Assim o zoom usa os pixels da cheia (2560/1600), não a pintura da tela.
 */
export function FotoZoomavel({
  srcMini,
  srcCheia,
  alt,
  carregarCheia,
  aoZoomAtivo,
  aoDeslizar,
}: Props): JSX.Element {
  const caixaRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [cheiaOk, setCheiaOk] = useState(false);
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [box, setBox] = useState({ w: 0, h: 0 });

  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const fitRef = useRef(1);
  const maxScaleRef = useRef(4);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{
    dist: number;
    scale: number;
    tx: number;
    ty: number;
    midX: number;
    midY: number;
  } | null>(null);
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const ultimoToque = useRef(0);
  const moved = useRef(false);

  useEffect(() => {
    setCheiaOk(false);
    setNat({ w: 0, h: 0 });
    scaleRef.current = 1;
    txRef.current = 0;
    tyRef.current = 0;
    setScale(1);
    setTx(0);
    setTy(0);
  }, [srcCheia]);

  useEffect(() => {
    const el = caixaRef.current;
    if (el === null) return;
    const medir = (): void => {
      setBox({ w: el.clientWidth, h: el.clientHeight });
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit =
    nat.w > 0 && nat.h > 0 && box.w > 0 && box.h > 0
      ? Math.min(box.w / nat.w, box.h / nat.h)
      : 1;
  fitRef.current = fit;
  // Até 1:1 com a bitmap (+ folga leve). Evita “zoom de tela” em imagem já pequena.
  const maxScale = limitar(1 / Math.max(fit, 0.05), 3, 8);
  maxScaleRef.current = maxScale;

  const aplicar = useCallback(
    (s: number, x: number, y: number) => {
      const ns = limitar(s, MIN, maxScaleRef.current);
      let nx = x;
      let ny = y;
      if (ns <= MIN + 0.01) {
        nx = 0;
        ny = 0;
      } else {
        const caixa = caixaRef.current;
        if (caixa !== null && nat.w > 0) {
          const f = fitRef.current;
          const dw = nat.w * f * ns;
          const dh = nat.h * f * ns;
          const maxX = Math.max(0, (dw - caixa.clientWidth) / 2);
          const maxY = Math.max(0, (dh - caixa.clientHeight) / 2);
          nx = limitar(nx, -maxX, maxX);
          ny = limitar(ny, -maxY, maxY);
        }
      }
      scaleRef.current = ns;
      txRef.current = nx;
      tyRef.current = ny;
      setScale(ns);
      setTx(nx);
      setTy(ny);
      aoZoomAtivo?.(ns > 1.02);
    },
    [aoZoomAtivo, nat.w, nat.h],
  );

  useEffect(() => {
    return () => aoZoomAtivo?.(false);
  }, [aoZoomAtivo]);

  // Recalcula limites se a caixa/foto mudar com zoom ativo.
  useEffect(() => {
    if (scaleRef.current > 1) {
      aplicar(scaleRef.current, txRef.current, tyRef.current);
    }
  }, [box.w, box.h, nat.w, nat.h, aplicar]);

  function zoomEm(pontoX: number, pontoY: number, fator: number): void {
    const caixa = caixaRef.current;
    if (caixa === null) return;
    const rect = caixa.getBoundingClientRect();
    const cx = pontoX - rect.left - rect.width / 2;
    const cy = pontoY - rect.top - rect.height / 2;
    const s0 = scaleRef.current;
    const s1 = limitar(s0 * fator, MIN, maxScaleRef.current);
    if (s1 === s0) return;
    const k = s1 / s0;
    aplicar(s1, cx - (cx - txRef.current) * k, cy - (cy - tyRef.current) * k);
  }

  function aoPointerDown(e: EventoPointer): void {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;

    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      const a = pts[0];
      const b = pts[1];
      if (a !== undefined && b !== undefined) {
        pinch.current = {
          dist: Math.max(1, distancia(a, b)),
          scale: scaleRef.current,
          tx: txRef.current,
          ty: tyRef.current,
          midX: (a.x + b.x) / 2,
          midY: (a.y + b.y) / 2,
        };
        pan.current = null;
        swipe.current = null;
      }
      return;
    }

    if (scaleRef.current > 1.02) {
      pan.current = {
        x: e.clientX,
        y: e.clientY,
        tx: txRef.current,
        ty: tyRef.current,
      };
      swipe.current = null;
    } else {
      pan.current = null;
      swipe.current = { x: e.clientX, y: e.clientY };
    }
  }

  function aoPointerMove(e: EventoPointer): void {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinch.current !== null) {
      e.preventDefault();
      const pts = [...pointers.current.values()];
      const a = pts[0];
      const b = pts[1];
      if (a === undefined || b === undefined) return;
      const p = pinch.current;
      const d = distancia(a, b);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const s1 = limitar(p.scale * (d / p.dist), MIN, maxScaleRef.current);
      const k = s1 / Math.max(0.001, p.scale);
      aplicar(s1, p.tx * k + (midX - p.midX), p.ty * k + (midY - p.midY));
      moved.current = true;
      return;
    }

    if (pan.current !== null && scaleRef.current > 1.02) {
      e.preventDefault();
      const dx = e.clientX - pan.current.x;
      const dy = e.clientY - pan.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
      aplicar(scaleRef.current, pan.current.tx + dx, pan.current.ty + dy);
    }
  }

  function aoPointerUp(e: EventoPointer): void {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      if (swipe.current !== null && scaleRef.current <= 1.02 && aoDeslizar !== undefined) {
        const dx = e.clientX - swipe.current.x;
        const dy = e.clientY - swipe.current.y;
        if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          aoDeslizar(dx < 0 ? 1 : -1);
          moved.current = true;
        }
      }
      pan.current = null;
      swipe.current = null;
      if (!moved.current && e.pointerType !== 'mouse') {
        const agora = Date.now();
        if (agora - ultimoToque.current < DUPLO_MS) {
          if (scaleRef.current > 1.05) aplicar(1, 0, 0);
          else zoomEm(e.clientX, e.clientY, Math.min(2.5, maxScaleRef.current));
          ultimoToque.current = 0;
        } else {
          ultimoToque.current = agora;
        }
      }
    } else if (pointers.current.size === 1 && scaleRef.current > 1.02) {
      const restante = [...pointers.current.entries()][0];
      if (restante !== undefined) {
        const [, p] = restante;
        pan.current = { x: p.x, y: p.y, tx: txRef.current, ty: tyRef.current };
      }
    }
  }

  function aoWheel(e: EventoRoda): void {
    e.preventDefault();
    const fator = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomEm(e.clientX, e.clientY, fator);
  }

  function aoDuploClique(e: EventoMouse): void {
    e.preventDefault();
    if (scaleRef.current > 1.05) aplicar(1, 0, 0);
    else zoomEm(e.clientX, e.clientY, Math.min(2.5, maxScaleRef.current));
  }

  function aoCheiaPronta(el: HTMLImageElement): void {
    if (el.naturalWidth > 0) {
      setNat({ w: el.naturalWidth, h: el.naturalHeight });
      setCheiaOk(true);
    }
  }

  const zoomado = scale > 1.02;
  const dispW = nat.w > 0 ? nat.w * fit * scale : undefined;
  const dispH = nat.h > 0 ? nat.h * fit * scale : undefined;

  return (
    <div
      ref={caixaRef}
      className={`quadro-zoom${zoomado ? ' quadro-zoom--ativo' : ''}`}
      onPointerDown={aoPointerDown}
      onPointerMove={aoPointerMove}
      onPointerUp={aoPointerUp}
      onPointerCancel={aoPointerUp}
      onWheel={aoWheel}
      onDoubleClick={aoDuploClique}
    >
      <div
        className={`quadro-zoom__palco${cheiaOk ? ' quadro-zoom__palco--pronta' : ''}`}
        style={{
          transform: `translate3d(${tx}px, ${ty}px, 0)`,
        }}
      >
        {!cheiaOk && (
          <img
            className="quadro-zoom__mini"
            src={srcMini}
            alt=""
            draggable={false}
            decoding="async"
          />
        )}
        {carregarCheia && (
          <img
            className={`quadro-zoom__cheia${cheiaOk ? ' on' : ''}`}
            src={srcCheia}
            alt={alt}
            draggable={false}
            decoding="async"
            // Tamanho explícito = usa pixels da cheia no zoom (não escala bitmap da tela)
            style={
              dispW !== undefined && dispH !== undefined
                ? { width: dispW, height: dispH, maxWidth: 'none', maxHeight: 'none' }
                : undefined
            }
            onLoad={(e) => aoCheiaPronta(e.currentTarget)}
            ref={(el) => {
              if (el !== null && el.complete && el.naturalWidth > 0) aoCheiaPronta(el);
            }}
          />
        )}
      </div>
    </div>
  );
}
