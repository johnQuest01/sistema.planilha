import { useEffect, useRef, useState } from 'react';
import { LogIn } from 'lucide-react';
import { api } from '../api/cliente';
import {
  assinarRealtime,
  desligarRealtime,
  ligarRealtime,
  realtimeAberto,
  type Entrada,
  type Online,
} from '../api/realtime';
import { useAuth } from '../contexto/Auth';
import './presenca.css';

const AVISO_MS = 6000;
const FALLBACK_POLL_MS = 20_000;

interface Aviso {
  id: string;
  texto: string;
}

export function Presenca(): JSX.Element | null {
  const { estado, sair } = useAuth();
  const logado = estado.fase === 'logado';
  const meuId = estado.fase === 'logado' ? estado.usuario.id : null;

  const [online, setOnline] = useState<Online[]>([]);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const vistasRef = useRef<Set<string> | null>(null);
  const vivoRef = useRef(true);

  function processarEntradas(entradas: Entrada[]): void {
    const vistas = vistasRef.current;
    if (vistas === null) {
      vistasRef.current = new Set(entradas.map((e) => e.id));
      return;
    }
    const novos = entradas.filter((e) => !vistas.has(e.id) && e.usuarioId !== meuId);
    for (const e of novos) vistas.add(e.id);
    if (novos.length === 0) return;
    const ordenados = [...novos].reverse();
    setAvisos((atual) => [
      ...atual,
      ...ordenados.map((e) => ({ id: e.id, texto: `${e.nome} entrou` })),
    ]);
    for (const e of ordenados) {
      setTimeout(() => {
        if (vivoRef.current) setAvisos((atual) => atual.filter((a) => a.id !== e.id));
      }, AVISO_MS);
    }
  }

  useEffect(() => {
    if (!logado) {
      setOnline([]);
      setAvisos([]);
      vistasRef.current = null;
      return undefined;
    }

    vivoRef.current = true;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    async function poll(): Promise<void> {
      if (!vivoRef.current || realtimeAberto()) return;
      try {
        const p = await api.presenca();
        if (!vivoRef.current) return;
        setOnline(p.online);
        processarEntradas(p.entradas);
      } catch {
        /* ignora */
      }
    }

    // Presença ao vivo pelo WebSocket compartilhado; enquanto ele não estiver
    // aberto (cold start do Render, queda de rede, proxy que barra WS), a
    // presença é mantida por REST.
    const cancelar = assinarRealtime((msg) => {
      if (!vivoRef.current) return;
      if (msg.tipo === 'acesso_revogado') {
        // Admin tirou o acesso: desloga na hora (some da sessão).
        void sair();
        return;
      }
      if (msg.tipo === 'presenca') {
        setOnline(msg.online);
        processarEntradas(msg.entradas);
      } else if (msg.tipo === 'entrada') {
        processarEntradas([msg.entrada]);
      }
    });

    ligarRealtime();
    void poll();
    // Fallback REST: só busca quando o WS não está aberto.
    pollTimer = setInterval(() => void poll(), FALLBACK_POLL_MS);

    return () => {
      vivoRef.current = false;
      cancelar();
      if (pollTimer !== null) clearInterval(pollTimer);
      desligarRealtime();
    };
    // processarEntradas usa meuId do closure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logado, meuId, sair]);

  if (!logado) return null;

  const nomes = online.map((o) => (o.id === meuId ? `${o.nome} (você)` : o.nome));

  return (
    <>
      {avisos.length > 0 && (
        <div className="presenca-avisos" aria-live="polite">
          {avisos.map((a) => (
            <div key={a.id} className="presenca-aviso">
              <LogIn size={16} />
              <span>{a.texto}</span>
            </div>
          ))}
        </div>
      )}
      {online.length > 0 && (
        <div className="presenca-online" title={nomes.join(', ')}>
          <span className="presenca-online__dot" />
          <span className="presenca-online__txt">
            {online.length} online · {nomes.join(', ')}
          </span>
        </div>
      )}
    </>
  );
}
