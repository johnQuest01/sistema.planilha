import './ui.css';

interface Opcao<T extends string> {
  valor: T;
  rotulo: string;
}

interface Props<T extends string> {
  opcoes: Opcao<T>[];
  valor: T;
  onMudar: (valor: T) => void;
  rotuloAria?: string;
}

export function Segmentado<T extends string>({
  opcoes,
  valor,
  onMudar,
  rotuloAria,
}: Props<T>): JSX.Element {
  return (
    <div className="segmentado" role="tablist" aria-label={rotuloAria}>
      {opcoes.map((o) => {
        const ativa = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="tab"
            aria-selected={ativa}
            className={`segmentado__opcao${ativa ? ' segmentado__opcao--ativa' : ''}`}
            onClick={() => onMudar(o.valor)}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}
