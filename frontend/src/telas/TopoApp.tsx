import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut, Scissors, Settings, Trash2 } from 'lucide-react';
import { useAuth } from '../contexto/Auth';
import { ErroApi } from '../api/cliente';
import './telas.css';

export function TopoApp(): JSX.Element {
  const { estado, sair, contas, trocarConta, avisoPedido, limparAvisoPedido } = useAuth();
  const navegar = useNavigate();
  const local = useLocation();
  const nome = estado.fase === 'logado' ? estado.usuario.nome : '';
  const ehDono = estado.fase === 'logado' && estado.usuario.papel === 'dono';
  const contaAtiva = estado.fase === 'logado' ? estado.usuario.contaId : undefined;
  const contaNome = estado.fase === 'logado' ? estado.usuario.contaNome : undefined;
  const contasAtivas = contas.filter((c) => c.status === 'ativo');
  const pendentes = contas.filter((c) => c.status === 'pendente');

  const naHome = local.pathname === '/';
  function voltar(): void {
    if (window.history.length > 1) navegar(-1);
    else navegar('/');
  }

  async function onTrocar(contaId: string): Promise<void> {
    if (contaId === '' || contaId === contaAtiva) return;
    try {
      await trocarConta(contaId);
      navegar('/');
    } catch (e) {
      window.alert(e instanceof ErroApi ? e.message : 'não foi possível trocar de conta');
    }
  }

  return (
    <>
      {avisoPedido !== null && (
        <div className="topo-aviso" role="status">
          <span>{avisoPedido}</span>
          <button type="button" className="link-texto" onClick={limparAvisoPedido}>
            ok
          </button>
        </div>
      )}
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
        {contasAtivas.length > 1 && contaAtiva !== undefined && (
          <label className="topo-app__conta">
            <span className="topo-app__conta-rotulo">Conta</span>
            <select
              className="topo-app__conta-select"
              value={contaAtiva}
              aria-label="Trocar de conta"
              onChange={(e) => void onTrocar(e.target.value)}
            >
              {contasAtivas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.home ? ' (sua)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        {contasAtivas.length <= 1 && contaNome !== undefined && contaNome !== '' && (
          <span className="topo-app__conta-nome" title={contaNome}>
            {contaNome}
          </span>
        )}
        {pendentes.length > 0 && (
          <span className="topo-app__pendente" title="Aguardando aprovação do admin">
            {pendentes.length} pedido(s)
          </span>
        )}
        {nome !== '' && <span className="topo-app__email">{nome}</span>}
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
            title="Configurações — tokens, pedidos, usuários"
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
    </>
  );
}
