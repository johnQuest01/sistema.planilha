import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layers, Lock, Plus, Trash2 } from 'lucide-react';
import { api, ErroApi, type ColecaoResumo, type Integracao } from '../api/cliente';
import { prefetchColecoes } from '../api/prefetch';
import { useAuth } from '../contexto/Auth';
import { Botao } from '../ui/Botao';
import { Campo } from '../ui/Campo';
import { Carregando } from '../ui/Carregando';
import { TopoApp } from './TopoApp';
import './telas.css';

const fmtData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

export function Inicio(): JSX.Element {
  const navegar = useNavigate();
  const { estado } = useAuth();
  const usuario = estado.fase === 'logado' ? estado.usuario : null;
  const [colecoes, setColecoes] = useState<ColecaoResumo[] | null>(null);
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [falhaCarga, setFalhaCarga] = useState(false);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [apagandoId, setApagandoId] = useState<string | null>(null);

  function podeApagar(c: ColecaoResumo): boolean {
    return usuario !== null && (usuario.papel === 'dono' || c.criadoPor === usuario.id);
  }

  async function apagar(id: string): Promise<void> {
    setApagandoId(id);
    setErro(null);
    try {
      await api.apagarColecao(id);
      setColecoes((cs) => (cs === null ? cs : cs.filter((c) => c.id !== id)));
      setConfirmando(null);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'não foi possível apagar');
    } finally {
      setApagandoId(null);
    }
  }

  function carregarLista(): void {
    setColecoes(null);
    setFalhaCarga(false);
    setErro(null);
    // Integrações são um extra: se falharem (ex.: tabela não migrada), a Home segue.
    void api
      .listarIntegracoes()
      .then((is) => setIntegracoes(is))
      .catch(() => setIntegracoes([]));
    void api
      .listarColecoes()
      .then((cs) => {
        setColecoes(cs);
        // Aquece o cache das primeiras planilhas p/ o clique ficar instantâneo.
        prefetchColecoes(cs.filter((c) => !c.bloqueada).map((c) => c.id));
      })
      .catch((e: unknown) => {
        setErro(e instanceof ErroApi ? e.message : 'falha ao carregar');
        setFalhaCarga(true);
        setColecoes([]);
      });
  }

  useEffect(() => {
    let vivo = true;
    setColecoes(null);
    setFalhaCarga(false);
    void api
      .listarIntegracoes()
      .then((is) => {
        if (vivo) setIntegracoes(is);
      })
      .catch(() => {
        if (vivo) setIntegracoes([]);
      });
    void api
      .listarColecoes()
      .then((cs) => {
        if (!vivo) return;
        setColecoes(cs);
        // Aquece o cache das primeiras planilhas p/ o clique ficar instantâneo.
        prefetchColecoes(cs.filter((c) => !c.bloqueada).map((c) => c.id));
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setErro(e instanceof ErroApi ? e.message : 'falha ao carregar');
        setFalhaCarga(true);
        setColecoes([]);
      });
    return () => {
      vivo = false;
    };
  }, []);

  async function criar(e: FormEvent): Promise<void> {
    e.preventDefault();
    const limpo = nome.trim();
    if (limpo === '' || criando) return;
    setCriando(true);
    setErro(null);
    try {
      const col = await api.criarColecao(limpo);
      navegar(`/c/${col.id}`);
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'não foi possível criar');
    } finally {
      setCriando(false);
    }
  }

  async function carregarExemplo(): Promise<void> {
    if (criando) return;
    setCriando(true);
    setErro(null);
    try {
      const col = await api.criarColecao('Exemplo — Tecidos');
      await api.criarCampo(col.id, { nome: 'Nome', tipo: 'texto' });
      await api.criarCampo(col.id, { nome: 'Preço', tipo: 'numero', config: { sufixo: 'R$' } });
      await api.criarCampo(col.id, {
        nome: 'Categoria',
        tipo: 'selecao',
        config: { opcoes: ['Algodão', 'Linho', 'Seda'] },
      });
      await api.criarCampo(col.id, { nome: 'Fotos', tipo: 'imagem', config: { maxFotos: 5 } });
      navegar(`/c/${col.id}`);
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'não foi possível criar o exemplo');
      setCriando(false);
    }
  }

  if (colecoes === null) return <Carregando />;

  if (falhaCarga) {
    return (
      <div className="pagina">
        <TopoApp />
        <div className="faixa">
          <div className="inicio-vazio">
            <h1 className="inicio-vazio__titulo">Não foi possível carregar as planilhas</h1>
            {erro !== null && <p className="aviso-erro">{erro}</p>}
            <Botao variante="primario" onClick={() => carregarLista()}>
              Tentar de novo
            </Botao>
          </div>
        </div>
      </div>
    );
  }

  const vazio = colecoes.length === 0;

  return (
    <div className="pagina">
      <TopoApp />
      <div className="faixa">
        {vazio ? (
          <div className="inicio-vazio">
            <div className="corte inicio-vazio__corte" aria-hidden="true" />
            <h1 className="inicio-vazio__titulo">Nenhuma planilha ainda</h1>
            <form className="inicio-vazio__forma" onSubmit={criar}>
              <Campo
                aria-label="Nome da planilha"
                placeholder="Nome da planilha"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                autoFocus
              />
              <Botao
                variante="primario"
                type="submit"
                bloco
                disabled={criando || nome.trim() === ''}
              >
                Criar planilha do zero
              </Botao>
              {erro !== null && <p className="aviso-erro">{erro}</p>}
              <button type="button" className="link-texto" onClick={() => void carregarExemplo()}>
                ou carregar um exemplo
              </button>
            </form>
          </div>
        ) : (
          <>
            <div className="inicio-cabeca">
              <h1 className="inicio-cabeca__titulo">Suas planilhas</h1>
              <Link to="/integracoes" className="btn">
                <Layers size={18} /> Integrações
              </Link>
              <form className="inicio-criar" onSubmit={criar}>
                <Campo
                  aria-label="Nome da nova planilha"
                  placeholder="Nova planilha…"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
                <Botao variante="primario" type="submit" disabled={criando || nome.trim() === ''}>
                  <Plus size={18} />
                  Criar
                </Botao>
              </form>
            </div>
            {erro !== null && <p className="aviso-erro">{erro}</p>}
            {integracoes.filter((i) => i.ativo).length > 0 && (
              <>
                <h2 className="inicio-secao-titulo">
                  <Layers size={18} aria-hidden /> Planilhas unidas
                </h2>
                <div className="grade-cartoes">
                  {integracoes
                    .filter((i) => i.ativo)
                    .map((i) => (
                      <div key={i.id} className="cartao-colecao cartao-colecao--unida">
                        <Link to={`/i/${i.id}`} className="cartao-colecao__link">
                          <span className="cartao-colecao__nome">
                            <Layers size={15} className="cartao-colecao__cadeado-inline" aria-hidden />
                            {i.nome}
                          </span>
                          <span className="etiqueta cartao-colecao__meta">
                            {i.colecaoIds.length} planilhas unidas
                          </span>
                        </Link>
                      </div>
                    ))}
                </div>
                <h2 className="inicio-secao-titulo">Suas planilhas separadas</h2>
              </>
            )}
            <div className="grade-cartoes">
              {colecoes.map((c) => {
                const mostrarCadeado = c.protegida;
                const mostrarLixeira = podeApagar(c) && !c.bloqueada;
                return (
                <div key={c.id} className="cartao-colecao">
                  <Link to={`/c/${c.id}`} className="cartao-colecao__link">
                    <span className="cartao-colecao__nome">
                      {mostrarCadeado && (
                        <Lock
                          size={15}
                          className="cartao-colecao__cadeado-inline"
                          aria-hidden
                        />
                      )}
                      {c.nome}
                    </span>
                    <span className="etiqueta cartao-colecao__meta">
                      {c.bloqueada
                        ? 'senha necessária'
                        : fmtData.format(new Date(c.atualizadoEm))}
                    </span>
                  </Link>
                  {(mostrarCadeado || mostrarLixeira) && (
                    <div className="cartao-colecao__acoes">
                      {mostrarCadeado && (
                        <span
                          className="cartao-colecao__cadeado"
                          title="Protegida por senha"
                          aria-label="Protegida por senha"
                        >
                          <Lock size={18} aria-hidden />
                        </span>
                      )}
                      {mostrarLixeira && (
                        <button
                          type="button"
                          className="btn btn--icone cartao-colecao__apagar"
                          aria-label={`Apagar planilha ${c.nome}`}
                          title="Apagar planilha"
                          onClick={() => setConfirmando(c.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  )}
                  {confirmando === c.id && (
                    <div className="cartao-colecao__confirma">
                      <span className="cartao-colecao__confirma-txt">
                        Enviar “{c.nome}” para a lixeira?
                      </span>
                      <div className="cartao-colecao__confirma-acoes">
                        <Botao
                          variante="perigo"
                          bloco
                          disabled={apagandoId === c.id}
                          onClick={() => void apagar(c.id)}
                        >
                          Lixeira
                        </Botao>
                        <Botao
                          variante="fantasma"
                          bloco
                          onClick={() => setConfirmando(null)}
                        >
                          Cancelar
                        </Botao>
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
