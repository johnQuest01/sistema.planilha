import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, type ContaAcessivel, type Usuario } from '../api/cliente';
import { limparCache } from '../api/cache';
import { desligarRealtime } from '../api/realtime';
import { definirWsBase } from '../api/runtime';
import { definirBaseR2 } from '../imagens/urls';

type Estado =
  | { fase: 'carregando' }
  | { fase: 'deslogado' }
  | { fase: 'logado'; usuario: Usuario };

export type DadosRegistro = {
  nome: string;
  email: string;
  senha: string;
  /** Token/código para entrar numa conta existente. Sem token = cria conta nova. */
  token?: string;
  nomeConta?: string;
};

interface ContextoAuth {
  estado: Estado;
  contas: ContaAcessivel[];
  avisoPedido: string | null;
  limparAvisoPedido: () => void;
  entrar: (email: string, senha: string, token?: string) => Promise<void>;
  registrar: (dados: DadosRegistro) => Promise<void>;
  trocarConta: (contaId: string) => Promise<void>;
  recarregarContas: () => Promise<void>;
  sair: () => Promise<void>;
}

const Ctx = createContext<ContextoAuth | null>(null);

function avisoDoPedido(u: Usuario): string | null {
  const p = u.pedido;
  if (p == null) return null;
  if (p.status === 'pendente') {
    return `Pedido enviado para “${p.contaNome}”. Aguarde o admin aprovar o acesso.`;
  }
  if (p.status === 'ativo') {
    return `Acesso à conta “${p.contaNome}” liberado.`;
  }
  return null;
}

export function ProvedorAuth({ children }: { children: ReactNode }): JSX.Element {
  const [estado, setEstado] = useState<Estado>({ fase: 'carregando' });
  const [contas, setContas] = useState<ContaAcessivel[]>([]);
  const [avisoPedido, setAvisoPedido] = useState<string | null>(null);

  const recarregarContas = useCallback(async () => {
    try {
      const lista = await api.listarContas();
      setContas(lista);
    } catch {
      setContas([]);
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [cfg, sessao] = await Promise.allSettled([api.config(), api.eu()]);
      if (!vivo) return;
      if (cfg.status === 'fulfilled') {
        definirBaseR2(cfg.value.r2PublicBase);
        definirWsBase(cfg.value.wsBase ?? '');
      }
      if (sessao.status === 'fulfilled') {
        setEstado({ fase: 'logado', usuario: sessao.value });
        void api.listarContas().then((lista) => {
          if (vivo) setContas(lista);
        });
      } else {
        void sessao;
        setEstado({ fase: 'deslogado' });
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const entrar = useCallback(
    async (email: string, senha: string, token?: string) => {
      const usuario = await api.entrar(email, senha, token);
      setEstado({ fase: 'logado', usuario });
      setAvisoPedido(avisoDoPedido(usuario));
      limparCache();
      await recarregarContas();
    },
    [recarregarContas],
  );

  const registrar = useCallback(
    async (dados: DadosRegistro) => {
      const usuario = await api.registrar(dados);
      setEstado({ fase: 'logado', usuario });
      setAvisoPedido(null);
      limparCache();
      await recarregarContas();
    },
    [recarregarContas],
  );

  const trocarConta = useCallback(async (contaId: string) => {
    const usuario = await api.trocarConta(contaId);
    limparCache();
    // contaId no estado faz Presenca/Inicio/WS remontarem ao vivo.
    setEstado({ fase: 'logado', usuario });
    setAvisoPedido(null);
  }, []);

  const sair = useCallback(async () => {
    desligarRealtime();
    await api.sair();
    limparCache();
    setContas([]);
    setAvisoPedido(null);
    setEstado({ fase: 'deslogado' });
  }, []);

  const limparAvisoPedido = useCallback(() => setAvisoPedido(null), []);

  const valor = useMemo<ContextoAuth>(
    () => ({
      estado,
      contas,
      avisoPedido,
      limparAvisoPedido,
      entrar,
      registrar,
      trocarConta,
      recarregarContas,
      sair,
    }),
    [
      estado,
      contas,
      avisoPedido,
      limparAvisoPedido,
      entrar,
      registrar,
      trocarConta,
      recarregarContas,
      sair,
    ],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAuth(): ContextoAuth {
  const ctx = useContext(Ctx);
  if (ctx === null) throw new Error('useAuth fora do ProvedorAuth');
  return ctx;
}
