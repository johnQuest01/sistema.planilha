import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Layers, Plus, Power, Trash2 } from 'lucide-react';
import { api, ErroApi, type ColecaoResumo, type Integracao } from '../api/cliente';
import { Botao } from '../ui/Botao';
import { Campo } from '../ui/Campo';
import { Carregando } from '../ui/Carregando';
import { TopoApp } from './TopoApp';
import './telas.css';
import './integracao.css';

export function Integracoes(): JSX.Element {
  const [colecoes, setColecoes] = useState<ColecaoResumo[] | null>(null);
  const [integracoes, setIntegracoes] = useState<Integracao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [selecionadas, setSelecionadas] = useState<string[]>([]); // ordem = ordem dos blocos
  const [criando, setCriando] = useState(false);
  const [alternandoId, setAlternandoId] = useState<string | null>(null);
  const [apagandoId, setApagandoId] = useState<string | null>(null);

  const nomePorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of colecoes ?? []) m.set(c.id, c.nome);
    return m;
  }, [colecoes]);

  useEffect(() => {
    let vivo = true;
    void Promise.all([api.listarColecoes(), api.listarIntegracoes()])
      .then(([cs, is]) => {
        if (!vivo) return;
        setColecoes(cs);
        setIntegracoes(is);
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setErro(e instanceof ErroApi ? e.message : 'falha ao carregar');
        setColecoes([]);
        setIntegracoes([]);
      });
    return () => {
      vivo = false;
    };
  }, []);

  function alternarSelecao(id: string): void {
    setSelecionadas((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id],
    );
  }

  async function criar(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (criando) return;
    const limpo = nome.trim();
    if (limpo === '' || selecionadas.length < 2) {
      setErro('Dê um nome e escolha ao menos duas planilhas.');
      return;
    }
    setCriando(true);
    setErro(null);
    try {
      const nova = await api.criarIntegracao({ nome: limpo, colecaoIds: selecionadas, ativo: true });
      setIntegracoes((atual) => [nova, ...(atual ?? [])]);
      setNome('');
      setSelecionadas([]);
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'não foi possível criar a integração');
    } finally {
      setCriando(false);
    }
  }

  async function alternarAtivo(integ: Integracao): Promise<void> {
    setAlternandoId(integ.id);
    setErro(null);
    try {
      const atualizada = await api.editarIntegracao(integ.id, { ativo: !integ.ativo });
      setIntegracoes((atual) =>
        (atual ?? []).map((i) => (i.id === integ.id ? atualizada : i)),
      );
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'não foi possível alternar');
    } finally {
      setAlternandoId(null);
    }
  }

  async function apagar(id: string): Promise<void> {
    setApagandoId(id);
    setErro(null);
    try {
      await api.apagarIntegracao(id);
      setIntegracoes((atual) => (atual ?? []).filter((i) => i.id !== id));
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'não foi possível apagar');
    } finally {
      setApagandoId(null);
    }
  }

  if (colecoes === null || integracoes === null) return <Carregando />;

  return (
    <div className="pagina">
      <TopoApp />
      <div className="faixa">
        <div className="inicio-cabeca">
          <h1 className="inicio-cabeca__titulo">
            <Layers size={22} aria-hidden /> Integrações de planilhas
          </h1>
        </div>
        <p className="integ-ajuda">
          Una planilhas numa só: os registros se juntam quando a <strong>referência</strong> é
          igual (ex.: 4871). Na ordem escolhida, os blocos aparecem no mesmo corpo, tanto na
          prévia quanto no preenchimento. Desligar uma integração separa tudo de volta — nada é
          alterado no banco.
        </p>

        {erro !== null && <p className="aviso-erro">{erro}</p>}

        <form className="integ-criar" onSubmit={criar}>
          <h2 className="integ-secao__titulo">Nova integração</h2>
          <Campo
            aria-label="Nome da integração"
            placeholder="Nome (ex.: Caderno do Hugo + Modelagem)"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
          <p className="integ-dica">
            Toque nas planilhas na ordem em que os blocos devem aparecer (a 1ª fica no topo).
          </p>
          <div className="integ-escolha">
            {colecoes.length === 0 ? (
              <span className="integ-vazio">Você ainda não tem planilhas.</span>
            ) : (
              colecoes.map((c) => {
                const pos = selecionadas.indexOf(c.id);
                const marcada = pos >= 0;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`integ-chip${marcada ? ' integ-chip--on' : ''}`}
                    onClick={() => alternarSelecao(c.id)}
                  >
                    {marcada && <span className="integ-chip__ordem">{pos + 1}</span>}
                    {c.nome}
                  </button>
                );
              })
            )}
          </div>
          <Botao variante="primario" type="submit" disabled={criando || selecionadas.length < 2}>
            <Plus size={18} />
            {criando ? 'Criando…' : 'Criar integração'}
          </Botao>
        </form>

        <h2 className="integ-secao__titulo">Suas integrações</h2>
        {integracoes.length === 0 ? (
          <p className="integ-vazio">Nenhuma integração ainda.</p>
        ) : (
          <div className="integ-lista">
            {integracoes.map((i) => (
              <div key={i.id} className={`integ-cartao${i.ativo ? '' : ' integ-cartao--off'}`}>
                <div className="integ-cartao__topo">
                  <span className="integ-cartao__nome">{i.nome}</span>
                  <span className={`integ-cartao__estado${i.ativo ? ' on' : ''}`}>
                    {i.ativo ? 'ativa' : 'desligada'}
                  </span>
                </div>
                <div className="integ-cartao__colecoes">
                  {i.colecaoIds.map((id, idx) => (
                    <span key={id} className="integ-cartao__col">
                      {idx > 0 && <ArrowRight size={13} aria-hidden />}
                      {nomePorId.get(id) ?? 'planilha removida'}
                    </span>
                  ))}
                </div>
                <div className="integ-cartao__acoes">
                  {i.ativo && (
                    <Link to={`/i/${i.id}`} className="btn integ-abrir">
                      Abrir integrada <ArrowRight size={16} />
                    </Link>
                  )}
                  <Botao
                    variante={i.ativo ? 'fantasma' : 'primario'}
                    disabled={alternandoId === i.id}
                    onClick={() => void alternarAtivo(i)}
                  >
                    <Power size={16} />
                    {alternandoId === i.id ? '…' : i.ativo ? 'Desligar' : 'Ligar'}
                  </Botao>
                  <button
                    type="button"
                    className="btn btn--icone integ-apagar"
                    aria-label={`Apagar integração ${i.nome}`}
                    title="Apagar integração"
                    disabled={apagandoId === i.id}
                    onClick={() => void apagar(i.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
