import { Link } from 'react-router-dom';
import { LogOut, Scissors } from 'lucide-react';
import { useAuth } from '../contexto/Auth';
import './telas.css';

export function TopoApp(): JSX.Element {
  const { estado, sair } = useAuth();
  const email = estado.fase === 'logado' ? estado.conta.email : '';
  return (
    <header className="topo-app">
      <Link to="/" className="topo-app__marca" style={{ color: 'inherit', textDecoration: 'none' }}>
        <Scissors size={18} />
        Mostruário
      </Link>
      <span className="topo-app__espaco" />
      {email !== '' && <span className="topo-app__email">{email}</span>}
      <button
        type="button"
        className="btn btn--icone"
        style={{ color: 'var(--giz)' }}
        aria-label="Sair"
        onClick={() => {
          void sair();
        }}
      >
        <LogOut size={18} />
      </button>
    </header>
  );
}
