import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './ui.css';

type Variante = 'primario' | 'padrao' | 'fantasma' | 'perigo';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  bloco?: boolean;
  children: ReactNode;
}

const CLASSE: Record<Variante, string> = {
  primario: 'btn--primario',
  padrao: '',
  fantasma: 'btn--fantasma',
  perigo: 'btn--perigo',
};

export function Botao({
  variante = 'padrao',
  bloco = false,
  className,
  children,
  type = 'button',
  ...resto
}: Props): JSX.Element {
  const classes = ['btn', CLASSE[variante], bloco ? 'btn--bloco' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={classes} {...resto}>
      {children}
    </button>
  );
}
