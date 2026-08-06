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
  // Último instante em que gravamos `visto_em` no banco para este socket. Serve
  // para não escrever no Postgres a cada ping (heartbeat = write amplification).
  ultimoVistoBanco: number;
}

const TICKET_TTL_MS = 60_000;
// Janela de coalescência do broadcast de presença. Vários conectar/desconectar
// quase simultâneos (surto de reconexão no cold start) colapsam num único
// snapshot + fan-out, em vez de O(N) queries e O(N²) mensagens.
const COALESCE_PRESENCA_MS = 300;
// Só regravamos `visto_em` se passou esse tempo desde a última escrita deste
// socket. A fonte da verdade de "online" é a memória (onlineAoVivo), então o
// banco só precisa de um carimbo aproximado para "entradas recentes".
const HEARTBEAT_DB_MS = 60_000;
// Sem sinal (ping) do cliente por esse tempo → conexão considerada morta. O
// cliente faz ping a cada ~25s (e ~60s quando a aba está em segundo plano),
// então 90s tolera um ping perdido sem derrubar quem ainda está por perto.
const CLIENTE_TIMEOUT_MS = 90_000;
const SWEEP_MS = 30_000;

const tickets = new Map<string, TicketPresenca>();
const salas = new Map<string, Set<ClienteWs>>();
const broadcastPendente = new Map<string, ReturnType<typeof setTimeout>>();
let varredor: ReturnType<typeof setInterval> | null = null;

/**
 * Agenda um broadcast de presença coalescido: se já houver um pendente para a
 * conta, não empilha outro — o disparo (em COALESCE_PRESENCA_MS) já lerá o estado
 * final. Evita o O(N²) de mensagens + O(N) de queries em surtos de churn.
 */
function agendarBroadcastPresenca(contaId: string): void {
  if (broadcastPendente.has(contaId)) return;
  const t = setTimeout(() => {
    broadcastPendente.delete(contaId);
    void broadcastPresenca(contaId);
  }, COALESCE_PRESENCA_MS);
  (t as unknown as { unref?: () => void }).unref?.();
  broadcastPendente.set(contaId, t);
}

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

/**
 * Modo live: avisa todo mundo da mesma conta que um registro foi criado,
 * atualizado ou apagado. O payload já é o `Registro` serializado (mesmo formato
 * do REST) em criar/atualizar; em apagar vai só o `registroId`. Como não toca no
 * banco, é síncrono e barato — cada aba decide o que fazer com base no
 * `colecaoId`. Se ninguém estiver conectado, não faz nada.
 */
export function broadcastRegistro(
  contaId: string,
  evento:
    | { acao: 'criado' | 'atualizado'; colecaoId: string; registro: unknown }
    | { acao: 'apagado'; colecaoId: string; registroId: string },
): void {
  const sala = salas.get(contaId);
  if (sala === undefined || sala.size === 0) return;
  const payload = JSON.stringify({ tipo: 'registro', ...evento });
  for (const c of sala) {
    if (aberto(c.socket)) c.socket.send(payload);
  }
}

/** Modo live: avisa a conta que a alavanca de edição mudou (todos sincronizam). */
export function broadcastTrava(contaId: string, liberada: boolean): void {
  const sala = salas.get(contaId);
  if (sala === undefined || sala.size === 0) return;
  const payload = JSON.stringify({ tipo: 'trava', liberada });
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
  agendarBroadcastPresenca(contaId);
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
  for (const contaId of afetadas) agendarBroadcastPresenca(contaId);
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
    ultimoVistoBanco: 0,
  };

  let sala = salas.get(ticket.contaId);
  if (sala === undefined) {
    sala = new Set();
    salas.set(ticket.contaId, sala);
  }
  sala.add(cliente);
  garantirVarredor();

  socket.on('message', (raw: unknown) => {
    const agora = Date.now();
    cliente.ultimoVisto = agora;
    void (async () => {
      try {
        const msg = JSON.parse(textoDaMensagem(raw)) as { tipo?: string };
        if (msg.tipo === 'ping') {
          // Só grava no banco se passou tempo suficiente desde a última escrita:
          // com muita gente online, gravar a cada ping saturaria o pool do Neon.
          if (agora - cliente.ultimoVistoBanco >= HEARTBEAT_DB_MS) {
            cliente.ultimoVistoBanco = agora;
            await marcarVisto(ticket.usuarioId);
          }
          enviar(socket, { tipo: 'pong' });
        }
      } catch {
        /* ignore */
      }
    })();
  });

  const aoSair = (): void => {
    if (removerCliente(cliente)) agendarBroadcastPresenca(ticket.contaId);
  };
  socket.on('close', aoSair);
  socket.on('error', aoSair);

  void (async () => {
    try {
      cliente.ultimoVistoBanco = Date.now();
      await marcarVisto(ticket.usuarioId);
      const dados = await snapshot(ticket.contaId);
      enviar(socket, { tipo: 'presenca', ...dados });
      // Avisa os demais de forma coalescida (surto de reconexão vira 1 fan-out).
      agendarBroadcastPresenca(ticket.contaId);
    } catch {
      socket.close(1011, 'falha na presença');
    }
  })();
}
