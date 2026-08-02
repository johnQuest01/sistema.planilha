import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, type Usuario } from '../api/cliente';
import { definirWsBase } from '../api/runtime';
import { definirBaseR2 } from '../imagens/urls';

type Estado =
  | { fase: 'carregando' }
  | { fase: 'deslogado' }
  | { fase: 'logado'; usuario: Usuario };

interface ContextoAuth {
  estado: Estado;
  entrar: (email: string, senha: string) => Promise<void>;
  registrar: (nome: string, email: string, senha: string, codigo: string) => Promise<void>;
  sair: () => Promise<void>;
}

const Ctx = createContext<ContextoAuth | null>(null);

export function ProvedorAuth({ children }: { children: ReactNode }): JSX.Element {
  const [estado, setEstado] = useState<Estado>({ fase: 'carregando' });

  useEffect(() => {
    let vivo = true;
    // Config (base do R2) e sessão de verdade em paralelo — antes era sequencial
    // e somava a latência do Render (cold start) duas vezes no boot.
    void (async () => {
      const [cfg, sessao] = await Promise.allSettled([api.config(), api.eu()]);
      if (!vivo) return;
      if (cfg.status === 'fulfilled') {
        definirBaseR2(cfg.value.r2PublicBase);
        definirWsBase(cfg.value.wsBase ?? '');
      }
      if (sessao.status === 'fulfilled') {
        setEstado({ fase: 'logado', usuario: sessao.value });
      } else {
        void sessao; // 401 ou rede → tela de entrar
        setEstado({ fase: 'deslogado' });
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const entrar = useCallback(async (email: string, senha: string) => {
    const usuario = await api.entrar(email, senha);
    setEstado({ fase: 'logado', usuario });
  }, []);

  const registrar = useCallback(
    async (nome: string, email: string, senha: string, codigo: string) => {
      const usuario = await api.registrar(nome, email, senha, codigo);
      setEstado({ fase: 'logado', usuario });
    },
    [],
  );

  const sair = useCallback(async () => {
    await api.sair();
    setEstado({ fase: 'deslogado' });
  }, []);

  const valor = useMemo<ContextoAuth>(
    () => ({ estado, entrar, registrar, sair }),
    [estado, entrar, registrar, sair],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAuth(): ContextoAuth {
  const ctx = useContext(Ctx);
  if (ctx === null) throw new Error('useAuth fora do ProvedorAuth');
  return ctx;
}
