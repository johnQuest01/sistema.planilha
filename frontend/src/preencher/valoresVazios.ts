import type { Campo } from '../../../shared/tipos';
import { agoraLocal, hojeLocal } from './CampoValor';

// Valores iniciais para um registro novo em branco (mesma estrutura, sem dados).
export function valoresVaziosDe(campos: Campo[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of campos) {
    if ((c.tipo === 'data' || c.tipo === 'datahora') && c.config.autoAgora === true) {
      out[c.id] = c.tipo === 'datahora' ? agoraLocal() : hojeLocal();
    }
  }
  return out;
}
