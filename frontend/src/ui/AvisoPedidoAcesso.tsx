import { useEffect, useRef, useState } from 'react';
import { UserCheck } from 'lucide-react';
import { api, ErroApi } from '../api/cliente';
import { assinarRealtime, type PedidoAcessoLive } from '../api/realtime';
import { useAuth } from '../contexto/Auth';
import { Botao } from './Botao';
import './avisoPedido.css';

type PedidoCard = PedidoAcessoLive & { id: string };

/**
 * Só o admin da conta ativa: card ao vivo quando alguém cola o token no login
 * (com nome + e-mail). Aprovar / Recusar sem ir na Config.
 */
export function AvisoPedidoAcesso(): JSX.Element | null {
  const { estado } = useAuth();
  const ehAdmin =
    estado.fase === 'logado' &&
    estado.usuario.papel === 'dono' &&
    estado.usuario.podeGerirSenhas === true;

  const [fila, setFila] = useState<PedidoCard[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const vivoRef = useRef(true);

  function enfileirar(p: PedidoAcessoLive): void {
    setFila((atual) => {
      if (atual.some((x) => x.usuarioId === p.usuarioId)) {
        return atual.map((x) =>
          x.usuarioId === p.usuarioId ? { ...x, nome: p.nome, email: p.email } : x,
        );
      }
      return [...atual, { ...p, id: `${p.usuarioId}-${Date.now()}` }];
    });
  }

  useEffect(() => {
    if (!ehAdmin) {
      setFila([]);
      return undefined;
    }
    vivoRef.current = true;

    // Pedidos já pendentes (abriu o app depois).
    void api
      .listarPedidosAcesso()
      .then((lista) => {
        if (!vivoRef.current) return;
        for (const p of lista) {
          enfileirar({
            usuarioId: p.usuarioId,
            nome: p.nome ?? '—',
            email: p.email ?? '',
          });
        }
      })
      .catch(() => {
        /* ignore */
      });

    const cancelar = assinarRealtime((msg) => {
      if (!vivoRef.current) return;
      if (msg.tipo === 'pedido_acesso') enfileirar(msg.pedido);
    });

    return () => {
      vivoRef.current = false;
      cancelar();
    };
  }, [ehAdmin]);

  const atual = fila[0];
  if (!ehAdmin || atual === undefined) return null;

  async function aprovar(usuarioId: string): Promise<void> {
    setBusyId(usuarioId);
    setErro(null);
    try {
      await api.aprovarPedidoAcesso(usuarioId);
      setFila((f) => f.filter((x) => x.usuarioId !== usuarioId));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'não foi possível aprovar');
    } finally {
      setBusyId(null);
    }
  }

  async function recusar(usuarioId: string): Promise<void> {
    setBusyId(usuarioId);
    setErro(null);
    try {
      await api.recusarPedidoAcesso(usuarioId);
      setFila((f) => f.filter((x) => x.usuarioId !== usuarioId));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'não foi possível recusar');
    } finally {
      setBusyId(null);
    }
  }

  function depois(): void {
    setFila((f) => f.slice(1));
  }

  return (
    <div className="aviso-pedido" role="alertdialog" aria-labelledby="aviso-pedido-titulo">
      <div className="aviso-pedido__card">
        <div className="aviso-pedido__topo">
          <UserCheck size={20} />
          <h2 id="aviso-pedido-titulo">Pedido de acesso</h2>
        </div>
        <p className="aviso-pedido__texto">
          Você deu um token de acesso? <strong>{atual.nome}</strong> está pedindo entrar na
          sua conta com o login:
        </p>
        <code className="aviso-pedido__email">{atual.email}</code>
        {fila.length > 1 && (
          <p className="aviso-pedido__mais">+{fila.length - 1} outro(s) na fila</p>
        )}
        {erro !== null && <p className="aviso-erro">{erro}</p>}
        <div className="aviso-pedido__acoes">
          <Botao
            variante="primario"
            disabled={busyId === atual.usuarioId}
            onClick={() => void aprovar(atual.usuarioId)}
          >
            Sim, aprovar
          </Botao>
          <Botao
            variante="fantasma"
            disabled={busyId === atual.usuarioId}
            onClick={() => void recusar(atual.usuarioId)}
          >
            Recusar
          </Botao>
          <Botao variante="fantasma" onClick={depois}>
            Depois
          </Botao>
        </div>
      </div>
    </div>
  );
}
