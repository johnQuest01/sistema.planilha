import './ui.css';

export function Carregando(): JSX.Element {
  return (
    <div className="carregando" role="status" aria-live="polite">
      <span className="carregando__giro" aria-hidden="true" />
      <span className="visualmente-oculto">Carregando</span>
    </div>
  );
}
