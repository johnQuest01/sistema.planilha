import type { ReactNode } from 'react';
import './ui.css';

interface Props {
  ativo?: boolean;
  onClick?: () => void;
  children: ReactNode;
  'aria-pressed'?: boolean;
}

export function Chip({ ativo = false, onClick, children }: Props): JSX.Element {
  return (
    <button
      type="button"
      className={`chip${ativo ? ' chip--ativo' : ''}`}
      aria-pressed={ativo}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
