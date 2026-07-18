import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useAuth } from '../contexto/Auth';
import './botao-lixeira.css';

const TAM = 56;
const MARGEM = 12;

interface Pos {
  x: number;
  y: number;
}

function chavePos(usuarioId: string): string {
  return `mostruario.lixeira.pos.${usuarioId}`;
}

function lerPos(usuarioId: string): Pos | null {
  try {
    const bruto = localStorage.getItem(chavePos(usuarioId));
    if (bruto === null) return null;
    const p = JSON.parse(bruto) as Pos;
    if (typeof p.x !== 'number' || typeof p.y !== 'number') return null;
    return p;
  } catch {
    return null;
  }
}

function salvarPos(usuarioId: string, pos: Pos): void {
  localStorage.setItem(chavePos(usuarioId), JSON.stringify(pos));
}

function limitar(pos: Pos): Pos {
  const maxX = Math.max(MARGEM, window.innerWidth - TAM - MARGEM);
  const maxY = Math.max(MARGEM, window.innerHeight - TAM - MARGEM);
  return {
    x: Math.min(maxX, Math.max(MARGEM, pos.x)),
    y: Math.min(maxY, Math.max(MARGEM, pos.y)),
  };
}

function posPadrao(): Pos {
  return limitar({
    x: window.innerWidth - TAM - 20,
    y: window.innerHeight - TAM - 88,
  });
}

export function BotaoLixeiraFlutuante(): JSX.Element | null {
  const { estado } = useAuth();
  const navegar = useNavigate();
  const loc = useLocation();
  const usuarioId = estado.fase === 'logado' ? estado.usuario.id : null;

  const [pos, setPos] = useState<Pos>(() => posPadrao());
  const arrasto = useRef<{
    pointerId: number;
    ox: number;
    oy: number;
    sx: number;
    sy: number;
    moveu: boolean;
  } | null>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (usuarioId === null) return;
    const salva = lerPos(usuarioId);
    setPos(salva !== null ? limitar(salva) : posPadrao());
  }, [usuarioId]);

  useEffect(() => {
    function aoResize(): void {
      setPos((p) => limitar(p));
    }
    window.addEventListener('resize', aoResize);
    return () => window.removeEventListener('resize', aoResize);
  }, []);

  const aoPointerDown = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    arrasto.current = {
      pointerId: e.pointerId,
      ox: e.clientX,
      oy: e.clientY,
      sx: pos.x,
      sy: pos.y,
      moveu: false,
    };
  }, [pos.x, pos.y]);

  const aoPointerMove = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const a = arrasto.current;
    if (a === null || a.pointerId !== e.pointerId) return;
    const dx = e.clientX - a.ox;
    const dy = e.clientY - a.oy;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) a.moveu = true;
    setPos(limitar({ x: a.sx + dx, y: a.sy + dy }));
  }, []);

  const aoPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      const a = arrasto.current;
      if (a === null || a.pointerId !== e.pointerId) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* já liberado */
      }
      arrasto.current = null;
      if (usuarioId !== null) {
        setPos((p) => {
          const lim = limitar(p);
          salvarPos(usuarioId, lim);
          return lim;
        });
      }
      // Clique sem arrastar → abre a lixeira
      if (!a.moveu && loc.pathname !== '/lixeira') {
        navegar('/lixeira');
      }
    },
    [usuarioId, loc.pathname, navegar],
  );

  if (usuarioId === null || loc.pathname === '/entrar') return null;

  return (
    <button
      ref={botaoRef}
      type="button"
      className={`lixeira-fab${loc.pathname === '/lixeira' ? ' lixeira-fab--ativo' : ''}`}
      style={{ left: pos.x, top: pos.y }}
      aria-label="Lixeira — arraste para mover"
      title="Lixeira (arraste para mover)"
      onPointerDown={aoPointerDown}
      onPointerMove={aoPointerMove}
      onPointerUp={aoPointerUp}
      onPointerCancel={aoPointerUp}
    >
      <Trash2 size={22} />
    </button>
  );
}
