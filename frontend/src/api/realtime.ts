// Conexão WebSocket única da sessão (modo live). Presença e registros passam
// pelo MESMO socket: uma só conexão, um só ping/reconexão. Componentes só
// "assinam" as mensagens; quem liga/desliga é o <Presenca> conforme o login.

import { api } from './cliente';
import { urlWsPresenca } from './runtime';

export type Online = { id: string; nome: string };
export type Entrada = { id: string; usuarioId: string; nome: string };

export type MsgRealtime =
  | { tipo: 'presenca'; online: Online[]; entradas: Entrada[] }
  | { tipo: 'entrada'; entrada: Entrada }
  | { tipo: 'registro'; acao: 'criado' | 'atualizado'; colecaoId: string; registro: unknown }
  | { tipo: 'registro'; acao: 'apagado'; colecaoId: string; registroId: string }
  | { tipo: 'trava'; liberada: boolean }
  | { tipo: 'pong' };

type Assinante = (msg: MsgRealtime) => void;

const PING_MS = 25_000;
const RECONNECT_MS = 2_000;

const assinantes = new Set<Assinante>();
let ws: WebSocket | null = null;
let ligado = false; // sessão logada quer manter a conexão
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let visibilidadeLigada = false;

function aberto(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}

export function realtimeAberto(): boolean {
  return aberto();
}

function emitir(msg: MsgRealtime): void {
  for (const a of assinantes) {
    try {
      a(msg);
    } catch {
      /* um assinante com defeito não derruba os outros */
    }
  }
}

function limparPing(): void {
  if (pingTimer !== null) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function pingar(): void {
  if (aberto()) ws?.send(JSON.stringify({ tipo: 'ping' }));
}

function agendarReconexao(): void {
  if (reconnectTimer !== null || !ligado) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void conectar();
  }, RECONNECT_MS);
}

async function conectar(): Promise<void> {
  if (!ligado || ws !== null) return;
  try {
    const { ticket } = await api.ticketPresenca();
    if (!ligado) return;
    const s = new WebSocket(urlWsPresenca(ticket));
    ws = s;

    s.onopen = (): void => {
      limparPing();
      pingTimer = setInterval(pingar, PING_MS);
    };

    s.onmessage = (ev): void => {
      try {
        emitir(JSON.parse(String(ev.data)) as MsgRealtime);
      } catch {
        /* ignora mensagem malformada */
      }
    };

    s.onclose = (): void => {
      limparPing();
      if (ws === s) ws = null;
      if (ligado) agendarReconexao();
    };

    s.onerror = (): void => {
      s.close();
    };
  } catch {
    // Nem o ticket saiu (401/rede): tenta de novo em instantes.
    agendarReconexao();
  }
}

function aoVisibilidade(): void {
  if (!ligado || document.visibilityState !== 'visible') return;
  if (aberto()) pingar();
  else void conectar();
}

/** Liga a conexão da sessão (idempotente). Chamado quando o usuário está logado. */
export function ligarRealtime(): void {
  if (ligado) return;
  ligado = true;
  if (!visibilidadeLigada) {
    document.addEventListener('visibilitychange', aoVisibilidade);
    visibilidadeLigada = true;
  }
  void conectar();
}

/** Desliga a conexão (logout). Não mexe nos assinantes. */
export function desligarRealtime(): void {
  ligado = false;
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  limparPing();
  if (visibilidadeLigada) {
    document.removeEventListener('visibilitychange', aoVisibilidade);
    visibilidadeLigada = false;
  }
  if (ws !== null) {
    const s = ws;
    ws = null;
    s.onclose = null;
    s.close();
  }
}

/** Assina as mensagens do live. Retorna a função para cancelar a assinatura. */
export function assinarRealtime(fn: Assinante): () => void {
  assinantes.add(fn);
  return () => {
    assinantes.delete(fn);
  };
}
