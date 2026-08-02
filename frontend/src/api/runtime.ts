// Bases públicas definidas em runtime via GET /api/config.

let wsBase = '';

export function definirWsBase(base: string): void {
  wsBase = base.replace(/\/+$/, '');
}

/** URL do WebSocket de presença (ticket já incluído na query). */
export function urlWsPresenca(ticket: string): string {
  const base =
    wsBase !== ''
      ? wsBase
      : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
  return `${base}/ws/presenca?ticket=${encodeURIComponent(ticket)}`;
}
