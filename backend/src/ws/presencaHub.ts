import { randomBytes } from 'node:crypto';
import { entradasRecentes, marcarVisto } from '../repositorios/presenca';

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
  ultimoVisto: number;
}

const TICKET_TTL_MS = 60_000;
// Sem sinal (ping) do cliente por esse tempo → conexão considerada morta. O
// cliente faz ping a cada ~25s (e ~60s quando a aba está em segundo plano),
// então 90s tolera um ping perdido sem derrubar quem ainda está por perto.
const CLIENTE_TIMEOUT_MS = 90_000;
const SWEEP_MS = 30_000;

const tickets = new Map<string, TicketPresenca>();
const salas = new Map<string, Set<ClienteWs>>();
let varredor: ReturnType<typeof setInterval> | null = null;

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

/**
 * Quem está online = quem tem um WebSocket aberto agora (fonte da verdade em
 * memória, por conta). Deduplica por usuário (várias abas = 1 pessoa). Assim
 * entrar/sair reflete na hora, sem esperar a janela de heartbeat do banco.
 */
export function onlineAoVivo(contaId: string): { id: string; nome: string }[] {
  const sala = salas.get(contaId);
  if (sala === undefined) return [];
  const porUsuario = new Map<string, string>();
  for (const c of sala) {
    if (aberto(c.socket)) porUsuario.set(c.usuarioId, c.nome);
  }
  return [...porUsuario.entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

async function snapshot(contaId: string): Promise<{
  online: { id: string; nome: string }[];
  entradas: Awaited<ReturnType<typeof entradasRecentes>>;
}> {
  const entradas = await entradasRecentes(contaId, 10);
  return { online: onlineAoVivo(contaId), entradas };
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

/** Remove o cliente da sala. Retorna true se ele estava lá (evita broadcast duplo). */
function removerCliente(cliente: ClienteWs): boolean {
  const sala = salas.get(cliente.contaId);
  if (sala === undefined) return false;
  const removido = sala.delete(cliente);
  if (sala.size === 0) salas.delete(cliente.contaId);
  return removido;
}

/** Derruba conexões que pararam de dar sinal (queda de rede, sleep, crash da aba). */
function varrerMortos(): void {
  const agora = Date.now();
  const afetadas = new Set<string>();
  for (const sala of salas.values()) {
    for (const c of sala) {
      const inativo = agora - c.ultimoVisto > CLIENTE_TIMEOUT_MS;
      if (inativo || !aberto(c.socket)) {
        if (removerCliente(c)) afetadas.add(c.contaId);
        try {
          c.socket.close(1001, 'sem sinal');
        } catch {
          /* ignore */
        }
      }
    }
  }
  for (const contaId of afetadas) void broadcastPresenca(contaId);
  if (salas.size === 0 && varredor !== null) {
    clearInterval(varredor);
    varredor = null;
  }
}

function garantirVarredor(): void {
  if (varredor !== null) return;
  varredor = setInterval(varrerMortos, SWEEP_MS);
  // Não segura o processo vivo por causa do timer.
  (varredor as unknown as { unref?: () => void }).unref?.();
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
    ultimoVisto: Date.now(),
  };

  let sala = salas.get(ticket.contaId);
  if (sala === undefined) {
    sala = new Set();
    salas.set(ticket.contaId, sala);
  }
  sala.add(cliente);
  garantirVarredor();

  socket.on('message', (raw: unknown) => {
    cliente.ultimoVisto = Date.now();
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
    if (removerCliente(cliente)) void broadcastPresenca(ticket.contaId);
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
