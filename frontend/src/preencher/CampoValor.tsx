import type { KeyboardEvent } from 'react';
import type { Campo } from '../../../shared/tipos';
import './valores.css';

interface Props {
  campo: Campo;
  valor: unknown;
  aoMudar: (valor: unknown) => void;
  desabilitado?: boolean;
  aoConfirmar?: () => void; // Enter/Tab (edição inline da tabela)
  aoSairFoco?: () => void; // blur (salvar na ficha)
  autoFoco?: boolean;
}

function comoTexto(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

// "YYYY-MM-DD" e "YYYY-MM-DDTHH:mm" na hora LOCAL do aparelho (sem UTC/fuso).
export function hojeLocal(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function agoraLocal(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${hojeLocal()}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Renderiza o input do valor conforme o tipo do campo. Não trata 'imagem' — o chamador
// cuida disso (Grade, na ficha; placeholder, na prévia).
export function CampoValor({
  campo,
  valor,
  aoMudar,
  desabilitado = false,
  aoConfirmar,
  aoSairFoco,
  autoFoco = false,
}: Props): JSX.Element | null {
  const comum = {
    disabled: desabilitado,
    autoFocus: autoFoco,
    onBlur: aoSairFoco,
    onKeyDown: (e: KeyboardEvent) => {
      // Esc em input number/date reverte o campo ao valor de foco e dispara um onChange
      // com vazio — o que apagava o valor recém-digitado antes do flush da ficha. Barra
      // o comportamento nativo; o Esc ainda sobe pro document e fecha a folha.
      if (e.key === 'Escape') {
        e.preventDefault();
        return;
      }
      if (aoConfirmar !== undefined && (e.key === 'Enter' || e.key === 'Tab')) {
        if (e.key === 'Enter') e.preventDefault();
        aoConfirmar();
      }
    },
  };

  switch (campo.tipo) {
    case 'texto':
      return (
        <input
          className="campo__controle"
          type="text"
          value={comoTexto(valor)}
          onChange={(e) => aoMudar(e.target.value)}
          {...comum}
        />
      );
    case 'paragrafo':
      return (
        <textarea
          className="campo__controle"
          value={comoTexto(valor)}
          onChange={(e) => aoMudar(e.target.value)}
          disabled={desabilitado}
          autoFocus={autoFoco}
          onBlur={aoSairFoco}
        />
      );
    case 'numero':
      return (
        <div className="valor-num">
          <input
            className="campo__controle"
            type="number"
            inputMode="decimal"
            value={typeof valor === 'number' ? valor : ''}
            onChange={(e) => aoMudar(e.target.value === '' ? undefined : Number(e.target.value))}
            {...comum}
          />
          {campo.config.sufixo !== undefined && campo.config.sufixo !== '' && (
            <span className="valor-num__sufixo">{campo.config.sufixo}</span>
          )}
        </div>
      );
    case 'data':
      return (
        <div className="valor-data">
          <input
            className="campo__controle"
            type="date"
            value={comoTexto(valor)}
            onChange={(e) => aoMudar(e.target.value === '' ? undefined : e.target.value)}
            {...comum}
          />
          {!desabilitado && (
            <button type="button" className="btn btn--fantasma valor-data__agora" onClick={() => aoMudar(hojeLocal())}>
              Hoje
            </button>
          )}
        </div>
      );
    case 'datahora':
      return (
        <div className="valor-data">
          <input
            className="campo__controle"
            type="datetime-local"
            value={comoTexto(valor)}
            onChange={(e) => aoMudar(e.target.value === '' ? undefined : e.target.value)}
            {...comum}
          />
          {!desabilitado && (
            <button type="button" className="btn btn--fantasma valor-data__agora" onClick={() => aoMudar(agoraLocal())}>
              Agora
            </button>
          )}
        </div>
      );
    case 'booleano':
      return (
        <label className="valor-bool">
          <input
            className="valor-bool__check"
            type="checkbox"
            checked={valor === true}
            onChange={(e) => aoMudar(e.target.checked)}
            disabled={desabilitado}
            onBlur={aoSairFoco}
          />
          <span>{valor === true ? 'Sim' : 'Não'}</span>
        </label>
      );
    case 'selecao':
      return (
        <select
          className="campo__controle"
          value={comoTexto(valor)}
          onChange={(e) => aoMudar(e.target.value === '' ? undefined : e.target.value)}
          disabled={desabilitado}
          onBlur={aoSairFoco}
        >
          <option value="">—</option>
          {(campo.config.opcoes ?? []).map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      );
    case 'imagem':
      return null;
    default:
      return null;
  }
}
