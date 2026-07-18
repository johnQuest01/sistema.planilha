import { Link } from 'react-router-dom';
import { LogOut, Scissors, Settings } from 'lucide-react';
import { useAuth } from '../contexto/Auth';
import './telas.css';

export function TopoApp(): JSX.Element {
  const { estado, sair } = useAuth();
  const nome = estado.fase === 'logado' ? estado.usuario.nome : '';
  const ehDono = estado.fase === 'logado' && estado.usuario.papel === 'dono';
  return (
    <header className="topo-app">
      <Link to="/" className="topo-app__marca" style={{ color: 'inherit', textDecoration: 'none' }}>
        <Scissors size={18} />
        Mostruário
      </Link>
      <span className="topo-app__espaco" />
      {nome !== '' && <span className="topo-app__email">{nome}</span>}
      {ehDono && (
        <Link
          to="/config"
          className="btn btn--icone"
          style={{ color: 'var(--giz)' }}
          aria-label="Código de convite"
          title="Código de convite"
        >
          <Settings size={18} />
        </Link>
      )}
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
