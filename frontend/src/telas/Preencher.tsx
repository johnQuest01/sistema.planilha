import { useCallback, useEffect, useRef, useState } from 'react';
import { ListPlus, Plus, Rows2, Rows3 } from 'lucide-react';
import { api, ErroApi } from '../api/cliente';
import type { Campo, Colecao, Registro } from '../../../shared/tipos';
import { Botao } from '../ui/Botao';
import { useMedia } from '../ui/useMedia';
import { Tabela } from '../preencher/Tabela';
import { ListaDensa } from '../preencher/ListaDensa';
import { Ficha } from '../preencher/Ficha';
import { BuscaReferencia } from '../preencher/BuscaReferencia';
import { RegistroPreview } from '../preencher/RegistroPreview';
import { tituloDoRegistro } from '../preencher/derivarResumo';
import { valoresVaziosDe } from '../preencher/valoresVazios';
import { FolhaInferior } from '../ui/FolhaInferior';
import { FormBloco, type DadosBloco } from './FormBloco';
import '../preencher/preencher.css';

const PAGINA = 20;

function EsqueletoLista({ mobile }: { mobile: boolean }): JSX.Element {
  const n = mobile ? 8 : 6;
  return (
    <div className={`lista-skel${mobile ? '' : ' lista-skel--tabela'}`} aria-busy="true" aria-label="Carregando registros">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="lista-skel__linha">
          <span className="lista-skel__foto" />
          <span className="lista-skel__txt" />
        </div>
      ))}
    </div>
  );
}

export function Preencher({
  colecao,
  aoMudarCampos,
  registrosIniciais,
}: {
  colecao: Colecao;
  aoMudarCampos: (fn: (campos: Campo[]) => Campo[]) => void;
  /** undefined = prefetch ainda; null = falhou (busca aqui); array = usar */
  registrosIniciais?: Registro[] | null;
}): JSX.Element {
  const ehMobile = useMedia('(max-width: 768px)');
  const [registros, setRegistros] = useState<Registro[] | null>(() =>
    Array.isArray(registrosIniciais) ? registrosIniciais : null,
  );
  const [fim, setFim] = useState(() =>
    Array.isArray(registrosIniciais) ? registrosIniciais.length < PAGINA : false,
  );
  const [erro, setErro] = useState<string | null>(null);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [previa, setPrevia] = useState<Registro | null>(null);
  const [aberta, setAberta] = useState<Registro | null>(null);
  const [solto, setSolto] = useState(false);
  const [adicionandoCampo, setAdicionandoCampo] = useState(false);
  const carregandoMaisRef = useRef(false);
  const fimRef = useRef(fim);
  const registrosRef = useRef(registros);
  fimRef.current = fim;
  registrosRef.current = registros;

  async function adicionarCampo(d: DadosBloco): Promise<void> {
    const criado = await api.criarCampo(colecao.id, d);
    aoMudarCampos((cs) => [...cs, criado]);
    setAdicionandoCampo(false);
  }

  useEffect(() => {
    let vivo = true;
    setErro(null);

    if (registrosIniciais === undefined) {
      // Prefetch do pai ainda em voo — mantém skeleton, sem 2ª request.
      setRegistros(null);
      return () => {
        vivo = false;
      };
    }

    if (Array.isArray(registrosIniciais)) {
      setRegistros(registrosIniciais);
      setFim(registrosIniciais.length < PAGINA);
      return () => {
        vivo = false;
      };
    }

    // Prefetch falhou (ex.: senha) — busca própria.
    setRegistros(null);
    setFim(false);
    void api
      .listarRegistros(colecao.id)
      .then((rs) => {
        if (!vivo) return;
        setRegistros(rs);
        setFim(rs.length < PAGINA);
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setErro(e instanceof ErroApi ? e.message : 'falha ao carregar');
        setRegistros([]);
      });
    return () => {
      vivo = false;
    };
  }, [colecao.id, registrosIniciais]);

  const carregarMais = useCallback(async (): Promise<void> => {
    const atual = registrosRef.current;
    if (atual === null || atual.length === 0 || carregandoMaisRef.current || fimRef.current) return;
    carregandoMaisRef.current = true;
    setCarregandoMais(true);
    try {
      const ultimo = atual[atual.length - 1];
      if (ultimo === undefined) return;
      const mais = await api.listarRegistros(colecao.id, ultimo.criadoEm);
      setRegistros((prev) => (prev === null ? mais : [...prev, ...mais]));
      const acabou = mais.length < PAGINA;
      setFim(acabou);
      fimRef.current = acabou;
    } catch {
      /* silencioso */
    } finally {
      carregandoMaisRef.current = false;
      setCarregandoMais(false);
    }
  }, [colecao.id]);

  async function novo(valores?: Record<string, unknown>): Promise<void> {
    try {
      const iniciais = valores ?? valoresVaziosDe(colecao.campos);
      const r = await api.criarRegistro(colecao.id, iniciais);
      setRegistros((atual) => (atual === null ? [r] : [r, ...atual]));
      setAberta(r);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'não foi possível criar');
    }
  }

  async function duplicarVazio(): Promise<void> {
    await novo(valoresVaziosDe(colecao.campos));
  }

  const aoAtualizar = useCallback((r: Registro): void => {
    setRegistros((atual) => (atual === null ? atual : atual.map((x) => (x.id === r.id ? r : x))));
    setAberta((a) => (a !== null && a.id === r.id ? r : a));
    setPrevia((p) => (p !== null && p.id === r.id ? r : p));
  }, []);

  const aoApagar = useCallback((id: string): void => {
    setRegistros((atual) => (atual === null ? atual : atual.filter((x) => x.id !== id)));
    setAberta(null);
    setPrevia(null);
  }, []);

  const abrirPrevia = useCallback((r: Registro): void => {
    setAberta(null);
    setPrevia(r);
  }, []);

  const abrirEdicao = useCallback((r: Registro): void => {
    setPrevia(null);
    setAberta(r);
  }, []);

  if (colecao.campos.length === 0) {
    return (
      <div className="preencher-vazio">
        <p>Esta planilha ainda não tem blocos.</p>
        {adicionandoCampo ? (
          <div className="add-campo-inline">
            <FormBloco
              inicial={{ nome: '', tipo: 'texto', config: {} }}
              textoAcao="Adicionar campo"
              encadear={false}
              autoFoco
              aoSalvar={adicionarCampo}
              aoCancelar={() => setAdicionandoCampo(false)}
            />
          </div>
        ) : (
          <Botao variante="primario" onClick={() => setAdicionandoCampo(true)}>
            <ListPlus size={18} />
            Adicionar campo
          </Botao>
        )}
      </div>
    );
  }

  // Botão "Ver mais" fica DENTRO da área de rolagem da lista/tabela (no fim),
  // senão some abaixo do contêiner que tem scroll e altura próprios.
  const rodapeVerMais = !fim ? (
    <div className="ver-mais-rodape">
      <button
        type="button"
        className="btn-ver-mais"
        disabled={carregandoMais}
        onClick={() => void carregarMais()}
      >
        {carregandoMais ? 'Carregando…' : 'Ver mais'}
      </button>
    </div>
  ) : null;

  return (
    <>
      <div className="preencher-barra">
        <Botao variante="primario" onClick={() => void novo()} disabled={registros === null}>
          <Plus size={18} />
          Novo registro
        </Botao>
        <Botao
          variante="padrao"
          onClick={() => setAdicionandoCampo((a) => !a)}
          aria-expanded={adicionandoCampo}
        >
          <ListPlus size={18} />
          Adicionar campo
        </Botao>
        <span className="preencher-barra__espaco" />
        <span className="preencher-contagem">
          {registros === null ? '…' : `${registros.length} registro(s)`}
        </span>
        {ehMobile && (
          <button
            type="button"
            className="btn btn--icone"
            style={{ color: 'var(--giz)' }}
            aria-label={solto ? 'Ver compacto' : 'Ver solto'}
            aria-pressed={solto}
            onClick={() => setSolto((s) => !s)}
          >
            {solto ? <Rows3 size={18} /> : <Rows2 size={18} />}
          </button>
        )}
      </div>

      {erro !== null && <p className="aviso-erro">{erro}</p>}

      <BuscaReferencia
        colecao={colecao}
        aoAbrir={abrirEdicao}
        aoAtualizar={aoAtualizar}
        aoApagar={aoApagar}
      />

      {adicionandoCampo && (
        <div className="add-campo-inline">
          <FormBloco
            inicial={{ nome: '', tipo: 'texto', config: {} }}
            textoAcao="Adicionar campo"
            encadear={false}
            autoFoco
            aoSalvar={adicionarCampo}
            aoCancelar={() => setAdicionandoCampo(false)}
          />
        </div>
      )}

      {registros === null ? (
        <EsqueletoLista mobile={ehMobile} />
      ) : registros.length === 0 ? (
        <div className="preencher-vazio">Nenhum registro ainda. Toque em “Novo registro”.</div>
      ) : ehMobile ? (
        <ListaDensa
          key={solto ? 'lista-solto' : 'lista-compacto'}
          colecao={colecao}
          registros={registros}
          solto={solto}
          aoAbrir={abrirPrevia}
          aoAtualizar={aoAtualizar}
          rodape={rodapeVerMais}
          aoAproximarFim={carregarMais}
        />
      ) : (
        <Tabela
          colecao={colecao}
          registros={registros}
          aoAtualizar={aoAtualizar}
          aoAbrirFicha={abrirPrevia}
          rodape={rodapeVerMais}
        />
      )}

      {previa !== null && (
        <FolhaInferior
          titulo={tituloDoRegistro(colecao.campos, previa)}
          subtitulo="Prévia — toque em Abrir registro para editar"
          onFechar={() => setPrevia(null)}
        >
          <RegistroPreview
            colecao={colecao}
            registro={previa}
            aoAbrir={() => abrirEdicao(previa)}
            aoAtualizar={aoAtualizar}
            aoApagar={(id) => {
              aoApagar(id);
              setPrevia(null);
            }}
          />
        </FolhaInferior>
      )}

      {aberta !== null && (
        <Ficha
          colecao={colecao}
          registro={aberta}
          aoFechar={() => setAberta(null)}
          aoAtualizar={aoAtualizar}
          aoApagar={aoApagar}
          aoDuplicarVazio={() => void duplicarVazio()}
        />
      )}
    </>
  );
}
