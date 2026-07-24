import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Copy, Lock, Trash2 } from 'lucide-react';
import { api, ErroApi } from '../api/cliente';
import type { Campo, Colecao as TColecao } from '../../../shared/tipos';
import { useAuth } from '../contexto/Auth';
import { Segmentado } from '../ui/Segmentado';
import { Botao } from '../ui/Botao';
import { Campo as CampoUi } from '../ui/Campo';
import { Carregando } from '../ui/Carregando';
import { TopoApp } from './TopoApp';
import { Criar } from './Criar';
import { Preencher } from './Preencher';
import './colecao.css';
import './telas.css';

type Modo = 'criar' | 'preencher';

function nomeDoErroBloqueio(e: ErroApi): string {
  const c = e.corpo;
  if (
    c !== undefined &&
    typeof c === 'object' &&
    c !== null &&
    'nome' in c &&
    typeof (c as { nome: unknown }).nome === 'string'
  ) {
    return (c as { nome: string }).nome;
  }
  return 'Oficina';
}

export function Colecao(): JSX.Element {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const { estado } = useAuth();
  const usuario = estado.fase === 'logado' ? estado.usuario : null;
  const [colecao, setColecao] = useState<TColecao | null>(null);
  const [bloqueada, setBloqueada] = useState<{ nome: string } | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [senha, setSenha] = useState('');
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const [desbloqueando, setDesbloqueando] = useState(false);
  const [modo, setModo] = useState<Modo>('criar');
  const [nomeEdit, setNomeEdit] = useState('');
  const [duplicando, setDuplicando] = useState(false);
  const [confirmandoApagar, setConfirmandoApagar] = useState(false);
  const [apagando, setApagando] = useState(false);
  const nomeSalvo = useRef('');

  const recarregar = async (): Promise<void> => {
    const col = await api.obterColecao(id);
    setBloqueada(null);
    setErroCarga(null);
    setColecao(col);
    setNomeEdit(col.nome);
    nomeSalvo.current = col.nome;
  };

  const atualizarCampos = (fn: (campos: Campo[]) => Campo[]): void => {
    setColecao((c) => (c === null ? c : { ...c, campos: fn(c.campos) }));
  };

  useEffect(() => {
    let vivo = true;
    setColecao(null);
    setBloqueada(null);
    setErroCarga(null);
    void api
      .obterColecao(id)
      .then((col) => {
        if (!vivo) return;
        setColecao(col);
        setNomeEdit(col.nome);
        nomeSalvo.current = col.nome;
        setModo(col.campos.length === 0 ? 'criar' : 'preencher');
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        if (e instanceof ErroApi && e.status === 403) {
          setBloqueada({ nome: nomeDoErroBloqueio(e) });
          return;
        }
        if (e instanceof ErroApi && e.status === 404) {
          navegar('/', { replace: true });
          return;
        }
        setErroCarga(e instanceof ErroApi ? e.message : 'falha ao carregar a planilha');
      });
    return () => {
      vivo = false;
    };
  }, [id, navegar]);

  useEffect(() => {
    if (colecao !== null) document.title = `${colecao.nome} · Mostruário`;
    else if (bloqueada !== null) document.title = `${bloqueada.nome} · Mostruário`;
  }, [colecao, bloqueada]);

  async function desbloquear(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (senha.trim().length < 4 || desbloqueando) return;
    setDesbloqueando(true);
    setErroSenha(null);
    try {
      const col = await api.desbloquearColecao(id, senha);
      setBloqueada(null);
      setErroCarga(null);
      setSenha('');
      setColecao(col);
      setNomeEdit(col.nome);
      nomeSalvo.current = col.nome;
      setModo(col.campos.length === 0 ? 'criar' : 'preencher');
    } catch (err) {
      setErroSenha(err instanceof ErroApi ? err.message : 'senha inválida');
    } finally {
      setDesbloqueando(false);
    }
  }

  async function salvarNome(): Promise<void> {
    const limpo = nomeEdit.trim();
    if (limpo === '' || limpo === nomeSalvo.current) {
      setNomeEdit(nomeSalvo.current);
      return;
    }
    try {
      await api.renomearColecao(id, limpo);
      nomeSalvo.current = limpo;
      setColecao((c) => (c === null ? c : { ...c, nome: limpo }));
    } catch {
      setNomeEdit(nomeSalvo.current);
    }
  }

  async function duplicar(): Promise<void> {
    if (duplicando) return;
    setDuplicando(true);
    try {
      const copia = await api.duplicarColecao(id);
      navegar(`/c/${copia.id}`);
    } catch {
      setDuplicando(false);
    }
  }

  async function apagar(): Promise<void> {
    if (apagando) return;
    setApagando(true);
    try {
      await api.apagarColecao(id);
      navegar('/', { replace: true });
    } catch {
      setApagando(false);
      setConfirmandoApagar(false);
    }
  }

  if (bloqueada !== null) {
    return (
      <div className="pagina">
        <TopoApp />
        <div className="faixa">
          <div className="desbloquear">
            <div className="desbloquear__icone" aria-hidden="true">
              <Lock size={28} />
            </div>
            <h1 className="desbloquear__titulo">{bloqueada.nome}</h1>
            <p className="desbloquear__ajuda">
              Esta planilha é protegida por senha. Digite a senha para continuar.
            </p>
            <form className="desbloquear__forma" onSubmit={(e) => void desbloquear(e)}>
              <CampoUi
                rotulo="Senha da planilha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoFocus
              />
              <Botao
                variante="primario"
                type="submit"
                bloco
                disabled={desbloqueando || senha.trim().length < 4}
              >
                Desbloquear
              </Botao>
              {erroSenha !== null && <p className="aviso-erro">{erroSenha}</p>}
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (erroCarga !== null) {
    return (
      <div className="pagina">
        <TopoApp />
        <div className="faixa">
          <p className="aviso-erro">{erroCarga}</p>
          <Botao variante="primario" onClick={() => window.location.reload()}>
            Tentar de novo
          </Botao>
        </div>
      </div>
    );
  }

  if (colecao === null) return <Carregando />;

  const ehPreencher = modo === 'preencher';
  const podeApagar =
    usuario !== null && (usuario.papel === 'dono' || colecao.criadoPor === usuario.id);

  return (
    <div className="pagina">
      <TopoApp />
      <div className="faixa">
        <div className="colecao-barra">
          <input
            className="titulo-editavel"
            value={nomeEdit}
            aria-label="Nome da planilha"
            disabled={ehPreencher}
            onChange={(e) => setNomeEdit(e.target.value)}
            onBlur={() => void salvarNome()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setNomeEdit(nomeSalvo.current);
                e.currentTarget.blur();
              }
            }}
          />
          <button
            type="button"
            className="btn btn--icone"
            aria-label="Duplicar planilha (formato em branco)"
            title="Duplicar (formato em branco)"
            disabled={duplicando}
            onClick={() => void duplicar()}
          >
            <Copy size={18} />
          </button>
          {(colecao.protegida || podeApagar) && (
            <div className="colecao-barra__acoes">
              {colecao.protegida && (
                <span
                  className="colecao-barra__cadeado"
                  title="Protegida por senha"
                  aria-label="Protegida por senha"
                >
                  <Lock size={18} aria-hidden />
                </span>
              )}
              {podeApagar && (
                <button
                  type="button"
                  className="btn btn--icone colecao-barra__apagar"
                  aria-label="Apagar planilha"
                  title="Apagar planilha"
                  onClick={() => setConfirmandoApagar(true)}
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          )}
          <Segmentado
            rotuloAria="Modo da planilha"
            valor={modo}
            onMudar={setModo}
            opcoes={[
              { valor: 'criar', rotulo: 'Criar' },
              { valor: 'preencher', rotulo: 'Preencher' },
            ]}
          />
        </div>

        {confirmandoApagar && (
          <div className="colecao-apagar-confirma">
            <span className="colecao-apagar-confirma__txt">
              Enviar “{colecao.nome}” e tudo que ela contém para a lixeira?
            </span>
            <Botao variante="perigo" disabled={apagando} onClick={() => void apagar()}>
              Enviar para lixeira
            </Botao>
            <Botao variante="fantasma" onClick={() => setConfirmandoApagar(false)}>
              Cancelar
            </Botao>
          </div>
        )}

        {modo === 'criar' ? (
          <Criar
            colecao={colecao}
            aoMudarCampos={atualizarCampos}
            recarregar={() => void recarregar()}
          />
        ) : (
          <Preencher colecao={colecao} aoMudarCampos={atualizarCampos} />
        )}
      </div>
    </div>
  );
}
