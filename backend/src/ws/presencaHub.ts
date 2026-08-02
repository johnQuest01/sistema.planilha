import type { RawData, WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
import { entradasRecentes, marcarVisto, online } from '../repositorios/presenca';

export interface TicketPresenca {
  usuarioId: string;
  contaId: string;
  nome: string;
  exp: number;
}

interface ClienteWs {
  socket: WebSocket;
  usuarioId: string;
  contaId: string;
  nome: string;
}

const TICKET_TTL_MS = 60_000;
const tickets = new Map<string, TicketPresenca>();
const salas = new Map<string, Set<ClienteWs>>();

export function emitirTicketPresenca(
  usuarioId: string,
  contaId: string,
  nome: string,
): { ticket: string; expiraEm: number } {
  const ticket = randomBytes(24).toString('base64url');
  const expiraEm = Date.now() + TICKET_TTL_MS;
  tickets.set(ticket, { usuarioId, contaId, nome, exp: expiraEm });
  return { ticket, expiraEm };
}

export function consumirTicketPresenca(ticket: string): TicketPresenca | null {
  const t = tickets.get(ticket);
  tickets.delete(ticket);
  if (t === undefined) return null;
  if (Date.now() > t.exp) return null;
  return t;
}

function enviar(socket: WebSocket, msg: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

async function snapshot(contaId: string): Promise<{
  online: { id: string; nome: string }[];
  entradas: Awaited<ReturnType<typeof entradasRecentes>>;
}> {
  const [agora, entradas] = await Promise.all([online(contaId, 2), entradasRecentes(contaId, 10)]);
  return { online: agora, entradas };
}

export async function broadcastPresenca(contaId: string): Promise<void> {
  const sala = salas.get(contaId);
  if (sala === undefined || sala.size === 0) return;
  const dados = await snapshot(contaId);
  const payload = JSON.stringify({ tipo: 'presenca', ...dados });
  for (const c of sala) {
    if (c.socket.readyState === c.socket.OPEN) c.socket.send(payload);
  }
}

export async function anunciarEntradaWs(
  contaId: string,
  entrada: { id: string; usuarioId: string; nome: string; criadoEm: string },
): Promise<void> {
  const sala = salas.get(contaId);
  if (sala === undefined || sala.size === 0) return;
  const payload = JSON.stringify({ tipo: 'entrada', entrada });
  for (const c of sala) {
    if (c.socket.readyState === c.socket.OPEN) c.socket.send(payload);
  }
  await broadcastPresenca(contaId);
}

export async function conectarPresencaWs(
  socket: WebSocket,
  ticket: TicketPresenca,
): Promise<void> {
  const cliente: ClienteWs = {
    socket,
    usuarioId: ticket.usuarioId,
    contaId: ticket.contaId,
    nome: ticket.nome,
  };

  let sala = salas.get(ticket.contaId);
  if (sala === undefined) {
    sala = new Set();
    salas.set(ticket.contaId, sala);
  }
  sala.add(cliente);

  await marcarVisto(ticket.usuarioId);
  const dados = await snapshot(ticket.contaId);
  enviar(socket, { tipo: 'presenca', ...dados });
  void broadcastPresenca(ticket.contaId);

  socket.on('message', (raw: RawData) => {
    void (async () => {
      try {
        const texto = typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString() : String(raw);
        const msg = JSON.parse(texto) as { tipo?: string };
        if (msg.tipo === 'ping') {
          await marcarVisto(ticket.usuarioId);
          enviar(socket, { tipo: 'pong' });
        }
      } catch {
        /* ignore */
      }
    })();
  });

  const aoSair = (): void => {
    sala?.delete(cliente);
    if (sala !== undefined && sala.size === 0) salas.delete(ticket.contaId);
    void broadcastPresenca(ticket.contaId);
  };
  socket.on('close', aoSair);
  socket.on('error', aoSair);
}
