import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api, ErroApi, type ColecaoResumo } from '../api/cliente';
import { Botao } from '../ui/Botao';
import { Campo } from '../ui/Campo';
import { Carregando } from '../ui/Carregando';
import { TopoApp } from './TopoApp';
import './telas.css';

const fmtData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

export function Inicio(): JSX.Element {
  const navegar = useNavigate();
  const [colecoes, setColecoes] = useState<ColecaoResumo[] | null>(null);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    let vivo = true;
    void api
      .listarColecoes()
      .then((cs) => {
        if (vivo) setColecoes(cs);
      })
      .catch((e: unknown) => {
        if (vivo) setErro(e instanceof ErroApi ? e.message : 'falha ao carregar');
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
            <div className="grade-cartoes">
              {colecoes.map((c) => (
                <Link key={c.id} to={`/c/${c.id}`} className="cartao-colecao">
                  <span className="cartao-colecao__nome">{c.nome}</span>
                  <span className="etiqueta cartao-colecao__meta">
                    {fmtData.format(new Date(c.atualizadoEm))}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
