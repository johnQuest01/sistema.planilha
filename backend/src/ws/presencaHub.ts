import { randomBytes } from 'node:crypto';
import { entradasRecentes, marcarVisto, online } from '../repositorios/presenca';

export interface TicketPresenca {
  usuarioId: string;
  contaId: string;
  nome: string;
  exp: number;
}

/** API mínima do socket do @fastify/websocket (sem importar o pacote `ws`). */
export interface SocketPresenca {
  readyState: number;
  OPEN: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'message', cb: (raw: unknown) => void): void;
  on(event: 'close' | 'error', cb: () => void): void;
}

interface ClienteWs {
  socket: SocketPresenca;
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

function aberto(socket: SocketPresenca): boolean {
  return socket.readyState === socket.OPEN;
}

function enviar(socket: SocketPresenca, msg: unknown): void {
  if (aberto(socket)) socket.send(JSON.stringify(msg));
}

function textoDaMensagem(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8');
  if (ArrayBuffer.isView(raw)) {
    return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString('utf8');
  }
  return String(raw);
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
    if (aberto(c.socket)) c.socket.send(payload);
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
    if (aberto(c.socket)) c.socket.send(payload);
  }
  await broadcastPresenca(contaId);
}

/**
 * Handlers de mensagem/close são ligados de forma síncrona (exigência do
 * @fastify/websocket); o I/O no Neon roda depois.
 */
export function conectarPresencaWs(socket: SocketPresenca, ticket: TicketPresenca): void {
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

  socket.on('message', (raw: unknown) => {
    void (async () => {
      try {
        const msg = JSON.parse(textoDaMensagem(raw)) as { tipo?: string };
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

  void (async () => {
    try {
      await marcarVisto(ticket.usuarioId);
      const dados = await snapshot(ticket.contaId);
      enviar(socket, { tipo: 'presenca', ...dados });
      await broadcastPresenca(ticket.contaId);
    } catch {
      socket.close(1011, 'falha na presença');
    }
  })();
}
