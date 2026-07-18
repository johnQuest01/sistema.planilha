import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw, Trash2 } from 'lucide-react';
import { api, ErroApi, type ItemLixeira } from '../api/cliente';
import { urlMini } from '../imagens/urls';
import { Botao } from '../ui/Botao';
import { Carregando } from '../ui/Carregando';
import { TopoApp } from './TopoApp';
import './telas.css';
import './lixeira.css';

const R2_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9_-]{21}\.(jpe?g|png|webp)$/;

function coletarKeys(valor: unknown, out: string[] = []): string[] {
  if (typeof valor === 'string') {
    if (R2_KEY.test(valor)) out.push(valor);
    return out;
  }
  if (Array.isArray(valor)) {
    for (const item of valor) coletarKeys(item, out);
    return out;
  }
  if (valor !== null && typeof valor === 'object') {
    for (const v of Object.values(valor as Record<string, unknown>)) coletarKeys(v, out);
  }
  return out;
}

function tituloDoSnapshot(valores: Record<string, unknown>): string {
  for (const v of Object.values(valores)) {
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return 'Registro sem nome';
}

const fmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function Lixeira(): JSX.Element {
  const [itens, setItens] = useState<ItemLixeira[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setItens(await api.listarLixeira());
      setErro(null);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'falha ao carregar a lixeira');
      setItens([]);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function restaurar(id: string): Promise<void> {
    setOcupado(id);
    setErro(null);
    try {
      await api.restaurarLixeira(id);
      setItens((atual) => (atual === null ? atual : atual.filter((x) => x.id !== id)));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'não foi possível restaurar');
    } finally {
      setOcupado(null);
    }
  }

  async function apagarDefinitivo(id: string): Promise<void> {
    setOcupado(id);
    setErro(null);
    setConfirmando(null);
    try {
      await api.apagarLixeiraDefinitivo(id);
      setItens((atual) => (atual === null ? atual : atual.filter((x) => x.id !== id)));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'não foi possível apagar definitivamente');
    } finally {
      setOcupado(null);
    }
  }

  if (itens === null) {
    return (
      <div className="pagina">
        <TopoApp />
        <Carregando />
      </div>
    );
  }

  return (
    <div className="pagina">
      <TopoApp />
      <main className="faixa lixeira">
        <header className="lixeira__cabeca">
          <div>
            <h1 className="lixeira__titulo">Lixeira</h1>
            <p className="lixeira__sub">
              Registros apagados ficam aqui com fotos e dados. Restaure ou apague de vez
              (Neon + Cloudflare R2).
            </p>
          </div>
          <Link to="/" className="btn btn--fantasma">
            Voltar
          </Link>
        </header>

        {erro !== null && <p className="aviso-erro">{erro}</p>}

        {itens.length === 0 ? (
          <div className="lixeira__vazia">Nenhum registro na lixeira.</div>
        ) : (
          <ul className="lixeira__lista">
            {itens.map((item) => {
              const fotos = [...new Set(coletarKeys(item.valores))].slice(0, 6);
              const titulo = tituloDoSnapshot(item.valores);
              const busy = ocupado === item.id;
              return (
                <li key={item.id} className="lixeira__item">
                  <div className="lixeira__fotos">
                    {fotos.length === 0 ? (
                      <span className="lixeira__sem-foto">sem foto</span>
                    ) : (
                      fotos.map((k) => (
                        <img key={k} src={urlMini(k)} alt="" loading="lazy" />
                      ))
                    )}
                  </div>
                  <div className="lixeira__corpo">
                    <h2 className="lixeira__nome">{titulo}</h2>
                    <p className="lixeira__meta">
                      Planilha: <strong>{item.colecaoNome || '—'}</strong>
                      <br />
                      Apagado em {fmt.format(new Date(item.apagadoEm))}
                      {item.apagadoPorNome !== null && item.apagadoPorNome !== ''
                        ? ` por ${item.apagadoPorNome}`
                        : ''}
                    </p>
                  </div>
                  <div className="lixeira__acoes">
                    <Botao
                      variante="padrao"
                      disabled={busy}
                      onClick={() => void restaurar(item.id)}
                    >
                      <RotateCcw size={16} />
                      Restaurar
                    </Botao>
                    {confirmando === item.id ? (
                      <>
                        <Botao
                          variante="perigo"
                          disabled={busy}
                          onClick={() => void apagarDefinitivo(item.id)}
                        >
                          Apagar agora
                        </Botao>
                        <Botao
                          variante="fantasma"
                          disabled={busy}
                          onClick={() => setConfirmando(null)}
                        >
                          Cancelar
                        </Botao>
                      </>
                    ) : (
                      <Botao
                        variante="perigo"
                        disabled={busy}
                        onClick={() => setConfirmando(item.id)}
                      >
                        <Trash2 size={16} />
                        Apagar definitivo
                      </Botao>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
