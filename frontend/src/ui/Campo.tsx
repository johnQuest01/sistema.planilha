import { useId } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import './ui.css';

interface BaseProps {
  rotulo?: string;
  erro?: string;
}

type PropsInput = BaseProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & { multilinha?: false };
type PropsArea = BaseProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> & { multilinha: true };

export function Campo(props: PropsInput | PropsArea): JSX.Element {
  const id = useId();
  const { rotulo, erro } = props;

  const controle =
    props.multilinha === true
      ? (() => {
          const { rotulo: _r, erro: _e, multilinha: _m, ...resto } = props;
          void _r;
          void _e;
          void _m;
          return <textarea id={id} className="campo__controle" {...resto} />;
        })()
      : (() => {
          const { rotulo: _r, erro: _e, multilinha: _m, ...resto } = props;
          void _r;
          void _e;
          void _m;
          return <input id={id} className="campo__controle" {...resto} />;
        })();

  return (
    <label className="campo" htmlFor={id}>
      {rotulo !== undefined && <span className="campo__rotulo">{rotulo}</span>}
      {controle}
      {erro !== undefined && <span className="campo__erro">{erro}</span>}
    </label>
  );
}
