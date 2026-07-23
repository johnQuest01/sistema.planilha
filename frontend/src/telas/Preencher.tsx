import { useEffect, useState } from 'react';
import { ListPlus, Plus, Rows2, Rows3 } from 'lucide-react';
import { api, ErroApi } from '../api/cliente';
import type { Campo, Colecao, Registro } from '../../../shared/tipos';
import { Botao } from '../ui/Botao';
import { Carregando } from '../ui/Carregando';
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

const PAGINA = 50;

export function Preencher({
  colecao,
  aoMudarCampos,
}: {
  colecao: Colecao;
  aoMudarCampos: (fn: (campos: Campo[]) => Campo[]) => void;
}): JSX.Element {
  const ehMobile = useMedia('(max-width: 768px)');
  const [registros, setRegistros] = useState<Registro[] | null>(null);
  const [fim, setFim] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [previa, setPrevia] = useState<Registro | null>(null);
  const [aberta, setAberta] = useState<Registro | null>(null);
  const [solto, setSolto] = useState(false);
  const [adicionandoCampo, setAdicionandoCampo] = useState(false);

  // Adiciona um campo durante o preenchimento (vale em qualquer planilha, inclusive
  // cópias). O campo criado entra na coleção na hora, então tabela/ficha já o mostram.
  async function adicionarCampo(d: DadosBloco): Promise<void> {
    const criado = await api.criarCampo(colecao.id, d);
    aoMudarCampos((cs) => [...cs, criado]);
    setAdicionandoCampo(false);
  }

  useEffect(() => {
    let vivo = true;
    setRegistros(null);
    setFim(false);
    setErro(null);
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
  }, [colecao.id]);

  async function carregarMais(): Promise<void> {
    if (registros === null || registros.length === 0 || carregandoMais) return;
    setCarregandoMais(true);
    try {
      const ultimo = registros[registros.length - 1];
      if (ultimo === undefined) return;
      const mais = await api.listarRegistros(colecao.id, ultimo.criadoEm);
      setRegistros([...registros, ...mais]);
      setFim(mais.length < PAGINA);
    } catch {
      /* silencioso */
    } finally {
      setCarregandoMais(false);
    }
  }

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

  function aoAtualizar(r: Registro): void {
    setRegistros((atual) => (atual === null ? atual : atual.map((x) => (x.id === r.id ? r : x))));
    setAberta((a) => (a !== null && a.id === r.id ? r : a));
    setPrevia((p) => (p !== null && p.id === r.id ? r : p));
  }

  function aoApagar(id: string): void {
    setRegistros((atual) => (atual === null ? atual : atual.filter((x) => x.id !== id)));
    setAberta(null);
    setPrevia(null);
  }

  function abrirPrevia(r: Registro): void {
    setAberta(null);
    setPrevia(r);
  }

  function abrirEdicao(r: Registro): void {
    setPrevia(null);
    setAberta(r);
  }

  if (registros === null) return <Carregando />;

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

  return (
    <>
      <div className="preencher-barra">
        <Botao variante="primario" onClick={() => void novo()}>
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
        <span className="preencher-contagem">{registros.length} registro(s)</span>
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

      {registros.length === 0 ? (
        <div className="preencher-vazio">Nenhum registro ainda. Toque em “Novo registro”.</div>
      ) : ehMobile ? (
        <ListaDensa
          colecao={colecao}
          registros={registros}
          solto={solto}
          aoAbrir={abrirPrevia}
          aoAtualizar={aoAtualizar}
        />
      ) : (
        <Tabela
          colecao={colecao}
          registros={registros}
          aoAtualizar={aoAtualizar}
          aoAbrirFicha={abrirPrevia}
        />
      )}

      {!fim && registros.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--e4)' }}>
          <Botao variante="fantasma" onClick={() => void carregarMais()} disabled={carregandoMais}>
            Carregar mais
          </Botao>
        </div>
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
