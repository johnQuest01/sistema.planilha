import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut, Scissors, Settings, Trash2 } from 'lucide-react';
import { useAuth } from '../contexto/Auth';
import './telas.css';

export function TopoApp(): JSX.Element {
  const { estado, sair } = useAuth();
  const navegar = useNavigate();
  const local = useLocation();
  const nome = estado.fase === 'logado' ? estado.usuario.nome : '';
  const ehDono = estado.fase === 'logado' && estado.usuario.papel === 'dono';
  // Botão voltar: some na Home ("/"). Volta para a tela anterior sem recarregar o
  // app do zero; se não houver histórico (link direto), cai na Home.
  const naHome = local.pathname === '/';
  function voltar(): void {
    if (window.history.length > 1) navegar(-1);
    else navegar('/');
  }
  return (
    <header className="topo-app">
      {!naHome && (
        <button
          type="button"
          className="btn btn--icone topo-app__voltar"
          style={{ color: 'inherit' }}
          aria-label="Voltar para a tela anterior"
          title="Voltar"
          onClick={voltar}
        >
          <ArrowLeft size={20} />
        </button>
      )}
      <Link to="/" className="topo-app__marca" style={{ color: 'inherit', textDecoration: 'none' }}>
        <Scissors size={18} />
        Mostruário
      </Link>
      <span className="topo-app__espaco" />
      {nome !== '' && <span className="topo-app__email">{nome}</span>}
      {/* Lixeira e engrenagem: só o admin (dono) da conta. */}
      {ehDono && (
        <Link
          to="/lixeira"
          className="btn btn--icone"
          style={{ color: 'var(--giz)' }}
          aria-label="Lixeira"
          title="Lixeira — restaurar planilhas e fichas"
        >
          <Trash2 size={18} />
        </Link>
      )}
      {ehDono && (
        <Link
          to="/config"
          className="btn btn--icone"
          style={{ color: 'var(--giz)' }}
          aria-label="Configurações da conta"
          title="Configurações — tokens, usuários, senhas"
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
