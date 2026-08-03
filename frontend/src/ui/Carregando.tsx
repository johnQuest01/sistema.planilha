import { useEffect, useState } from 'react';
import { aoServidorLento } from '../api/cliente';
import './ui.css';

// `dica` fixa (opcional) ou, quando o servidor está demorando (cold start do free tier),
// mostra automaticamente um aviso para o usuário não achar que a tela travou.
export function Carregando({ dica }: { dica?: string }): JSX.Element {
  const [lento, setLento] = useState(false);
  useEffect(() => aoServidorLento(setLento), []);

  const texto =
    dica ??
    (lento ? 'Acordando o servidor… o primeiro acesso do dia pode levar alguns segundos.' : null);

  return (
    <div className="carregando" role="status" aria-live="polite">
      <span className="carregando__giro" aria-hidden="true" />
      {texto !== null ? (
        <p className="carregando__dica">{texto}</p>
      ) : (
        <span className="visualmente-oculto">Carregando</span>
      )}
    </div>
  );
}
