import { useEffect, useRef, useState } from 'react';
import { LogIn } from 'lucide-react';
import { api } from '../api/cliente';
import { urlWsPresenca } from '../api/runtime';
import { useAuth } from '../contexto/Auth';
import './presenca.css';

const AVISO_MS = 6000;
const PING_MS = 25_000;
const RECONNECT_MS = 2_000;
const FALLBACK_POLL_MS = 20_000;

interface Online {
  id: string;
  nome: string;
}
interface Entrada {
  id: string;
  usuarioId: string;
  nome: string;
}
interface Aviso {
  id: string;
  texto: string;
}

type MsgWs =
  | { tipo: 'presenca'; online: Online[]; entradas: Entrada[] }
  | { tipo: 'entrada'; entrada: Entrada }
  | { tipo: 'pong' };

export function Presenca(): JSX.Element | null {
  const { estado } = useAuth();
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
    let ws: WebSocket | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const wsAberto = (): boolean => ws !== null && ws.readyState === WebSocket.OPEN;

    async function poll(): Promise<void> {
      if (!vivoRef.current) return;
      try {
        const p = await api.presenca();
        if (!vivoRef.current) return;
        setOnline(p.online);
        processarEntradas(p.entradas);
      } catch {
        /* ignora */
      }
    }

    // Mantém a presença via REST enquanto o WebSocket não estiver aberto (cold
    // start do Render, queda de rede, proxy que barra WS). Para sozinho quando o
    // WS conecta.
    function garantirPoll(imediato: boolean): void {
      if (pollTimer !== null) return;
      const passo = async (): Promise<void> => {
        pollTimer = null;
        if (!vivoRef.current || wsAberto()) return;
        await poll();
        if (vivoRef.current && !wsAberto()) {
          pollTimer = setTimeout(() => void passo(), FALLBACK_POLL_MS);
        }
      };
      if (imediato) void passo();
      else pollTimer = setTimeout(() => void passo(), FALLBACK_POLL_MS);
    }

    function pararPoll(): void {
      if (pollTimer !== null) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    }

    function limparPing(): void {
      if (pingTimer !== null) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
    }

    function agendarReconexao(): void {
      if (reconnectTimer !== null) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void conectarWs();
      }, RECONNECT_MS);
    }

    async function conectarWs(): Promise<void> {
      if (!vivoRef.current || ws !== null) return;
      try {
        const { ticket } = await api.ticketPresenca();
        if (!vivoRef.current) return;
        ws = new WebSocket(urlWsPresenca(ticket));

        ws.onopen = () => {
          pararPoll();
          limparPing();
          pingTimer = setInterval(() => {
            const s = ws;
            if (s !== null && s.readyState === WebSocket.OPEN) {
              s.send(JSON.stringify({ tipo: 'ping' }));
            }
          }, PING_MS);
        };

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as MsgWs;
            if (msg.tipo === 'presenca') {
              setOnline(msg.online);
              processarEntradas(msg.entradas);
            } else if (msg.tipo === 'entrada') {
              processarEntradas([msg.entrada]);
            }
          } catch {
            /* ignore */
          }
        };

        ws.onclose = () => {
          limparPing();
          ws = null;
          if (!vivoRef.current) return;
          // Enquanto o WS não volta, mantém a presença por REST.
          garantirPoll(true);
          agendarReconexao();
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch {
        // Nem o ticket saiu (401/rede): presença por REST e tenta de novo.
        garantirPoll(true);
        agendarReconexao();
      }
    }

    function aoVisibilidade(): void {
      if (document.visibilityState !== 'visible') return;
      const s = ws;
      if (s !== null && s.readyState === WebSocket.OPEN) {
        s.send(JSON.stringify({ tipo: 'ping' }));
      } else if (s === null) {
        void poll();
        void conectarWs();
      }
    }

    document.addEventListener('visibilitychange', aoVisibilidade);
    // Presença imediata (não espera o handshake nem o cold start do Render) e,
    // em paralelo, abre o WebSocket para atualizações em tempo real.
    garantirPoll(true);
    void conectarWs();

    return () => {
      vivoRef.current = false;
      document.removeEventListener('visibilitychange', aoVisibilidade);
      limparPing();
      pararPoll();
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      if (ws !== null) {
        ws.onclose = null;
        ws.close();
      }
    };
    // processarEntradas usa meuId do closure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logado, meuId]);

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
