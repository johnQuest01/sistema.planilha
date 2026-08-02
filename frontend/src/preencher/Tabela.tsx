import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ImageOff } from 'lucide-react';
import { api, ErroApi } from '../api/cliente';
import type { Campo, Colecao, Registro } from '../../../shared/tipos';
import { CampoValor } from './CampoValor';
import {
  campoTituloDoRegistro,
  capaDoRegistro,
  formatarValor,
  textoDe,
  tituloDoRegistro,
} from './derivarResumo';
import { Miniatura } from './Miniatura';
import './preencher.css';

interface Props {
  colecao: Colecao;
  registros: Registro[];
  aoAtualizar: (r: Registro) => void;
  aoAbrirFicha: (r: Registro) => void;
  temMais?: boolean;
  carregandoMais?: boolean;
  aoCarregarMais?: () => void;
}

interface Edicao {
  rid: string;
  cid: string;
}

const ALTURA_LINHA = 96;

interface LinhaProps {
  r: Registro;
  colecao: Colecao;
  temImagem: boolean;
  campoTitulo: Campo | undefined;
  edicao: Edicao | null;
  rascunho: unknown;
  renomeando: boolean;
  rascunhoTitulo: string;
  salvandoTitulo: boolean;
  erroTitulo: string | null;
  aoAbrirFicha: (r: Registro) => void;
  iniciar: (r: Registro, c: Campo) => void;
  setRascunho: (v: unknown) => void;
  comitar: () => void;
  iniciarRenomear: (r: Registro) => void;
  setRascunhoTitulo: (v: string) => void;
  aoTeclarTitulo: (e: ReactKeyboardEvent<HTMLInputElement>, r: Registro) => void;
  salvarTitulo: (r: Registro) => void;
  cancelarRenomear: () => void;
}

const LinhaTabela = memo(function LinhaTabela({
  r,
  colecao,
  temImagem,
  campoTitulo,
  edicao,
  rascunho,
  renomeando,
  rascunhoTitulo,
  salvandoTitulo,
  erroTitulo,
  aoAbrirFicha,
  iniciar,
  setRascunho,
  comitar,
  iniciarRenomear,
  setRascunhoTitulo,
  aoTeclarTitulo,
  salvarTitulo,
  cancelarRenomear,
}: LinhaProps): JSX.Element {
  const capa = capaDoRegistro(colecao.campos, r);
  const titulo = tituloDoRegistro(colecao.campos, r);

  return (
    <tr>
      {temImagem && (
        <td>
          <button
            type="button"
            className="btn btn--icone"
            style={{ padding: 0 }}
            aria-label="Abrir ficha"
            onClick={() => aoAbrirFicha(r)}
          >
            {capa !== null ? (
              <Miniatura fotoKey={capa} tamanho={72} />
            ) : (
              <span className="capa capa--vazia" style={{ width: 72, height: 72 }}>
                <ImageOff size={22} />
              </span>
            )}
          </button>
        </td>
      )}
      <td className="celula-titulo">
        {renomeando ? (
          <div className="tabela-renomear">
            <input
              className="campo__controle tabela-renomear__input"
              value={rascunhoTitulo}
              autoFocus
              aria-label="Nome do registro"
              placeholder="Nome do registro"
              disabled={salvandoTitulo}
              onChange={(e) => setRascunhoTitulo(e.target.value)}
              onKeyDown={(e) => aoTeclarTitulo(e, r)}
            />
            <div className="tabela-renomear__acoes">
              <button
                type="button"
                className="lista-item__salvar"
                disabled={salvandoTitulo}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void salvarTitulo(r)}
              >
                {salvandoTitulo ? 'Salvando…' : 'Salvar'}
              </button>
              <button
                type="button"
                className="lista-item__cancelar"
                disabled={salvandoTitulo}
                onMouseDown={(e) => e.preventDefault()}
                onClick={cancelarRenomear}
              >
                Cancelar
              </button>
            </div>
            {erroTitulo !== null && <p className="aviso-erro">{erroTitulo}</p>}
          </div>
        ) : (
          <div className="tabela-titulo-bloco">
            <button type="button" className="tabela-titulo" onClick={() => aoAbrirFicha(r)}>
              {titulo}
            </button>
            {campoTitulo !== undefined && (
              <button
                type="button"
                className="tabela-renomear-btn"
                onClick={() => iniciarRenomear(r)}
              >
                Renomear
              </button>
            )}
          </div>
        )}
      </td>
      {colecao.campos.map((c) => {
        const editando = edicao?.rid === r.id && edicao.cid === c.id;
        if (c.tipo === 'imagem') {
          return (
            <td key={c.id} className="celula-editavel" onClick={() => aoAbrirFicha(r)}>
              <span className="etiqueta">
                {`${(r.valores[c.id] as unknown[] | undefined)?.length ?? 0} foto(s)`}
              </span>
            </td>
          );
        }
        if (c.tipo === 'secao') {
          return (
            <td key={c.id} className="celula-editavel" onClick={() => aoAbrirFicha(r)}>
              <span className="etiqueta">{formatarValor(c, r.valores[c.id]) || '— linhas'}</span>
            </td>
          );
        }
        return (
          <td
            key={c.id}
            className="celula-editavel"
            onClick={() => {
              if (!editando) iniciar(r, c);
            }}
          >
            {editando ? (
              <CampoValor
                campo={c}
                valor={rascunho}
                aoMudar={setRascunho}
                aoConfirmar={comitar}
                aoSairFoco={comitar}
                autoFoco
              />
            ) : (
              formatarValor(c, r.valores[c.id]) || '—'
            )}
          </td>
        );
      })}
    </tr>
  );
});

export function Tabela({
  colecao,
  registros,
  aoAtualizar,
  aoAbrirFicha,
  temMais = false,
  carregandoMais = false,
  aoCarregarMais,
}: Props): JSX.Element {
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [rascunho, setRascunho] = useState<unknown>(undefined);
  const [renomeandoId, setRenomeandoId] = useState<string | null>(null);
  const [rascunhoTitulo, setRascunhoTitulo] = useState('');
  const [salvandoTitulo, setSalvandoTitulo] = useState(false);
  const [erroTitulo, setErroTitulo] = useState<string | null>(null);
  const temImagem = colecao.campos.some((c) => c.tipo === 'imagem');
  const campoTitulo = campoTituloDoRegistro(colecao.campos);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLTableRowElement>(null);
  const colunas = (temImagem ? 1 : 0) + 1 + colecao.campos.length;

  const virtualizer = useVirtualizer({
    count: registros.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ALTURA_LINHA,
    overscan: 10,
  });

  const itens = virtualizer.getVirtualItems();
  const paddingTop = itens.length > 0 ? (itens[0]?.start ?? 0) : 0;
  const paddingBottom =
    itens.length > 0
      ? virtualizer.getTotalSize() - (itens[itens.length - 1]?.end ?? 0)
      : 0;

  const iniciar = useCallback((r: Registro, c: Campo): void => {
    setRenomeandoId(null);
    setEdicao({ rid: r.id, cid: c.id });
    setRascunho(r.valores[c.id]);
  }, []);

  const comitarValor = useCallback(async (): Promise<void> => {
    if (edicao === null) return;
    const { rid, cid } = edicao;
    const valor = rascunho;
    setEdicao(null);
    try {
      const atualizado = await api.editarRegistro(rid, { [cid]: valor });
      aoAtualizar(atualizado);
    } catch {
      /* silencioso */
    }
  }, [edicao, rascunho, aoAtualizar]);

  const iniciarRenomear = useCallback(
    (r: Registro): void => {
      if (campoTitulo === undefined) return;
      setEdicao(null);
      setRenomeandoId(r.id);
      setRascunhoTitulo(textoDe(r.valores[campoTitulo.id]));
      setErroTitulo(null);
    },
    [campoTitulo],
  );

  const cancelarRenomear = useCallback((): void => {
    setRenomeandoId(null);
    setErroTitulo(null);
  }, []);

  const salvarTitulo = useCallback(
    async (r: Registro): Promise<void> => {
      if (campoTitulo === undefined || renomeandoId !== r.id || salvandoTitulo) return;
      const atual = textoDe(r.valores[campoTitulo.id]);
      const novo = rascunhoTitulo.trim();
      if (novo === atual.trim()) {
        setRenomeandoId(null);
        return;
      }
      setSalvandoTitulo(true);
      setErroTitulo(null);
      try {
        const atualizado = await api.editarRegistro(r.id, { [campoTitulo.id]: novo });
        aoAtualizar(atualizado);
        setRenomeandoId(null);
      } catch (e) {
        setErroTitulo(e instanceof ErroApi ? e.message : 'não foi possível renomear');
      } finally {
        setSalvandoTitulo(false);
      }
    },
    [campoTitulo, renomeandoId, salvandoTitulo, rascunhoTitulo, aoAtualizar],
  );

  const aoTeclarTitulo = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>, r: Registro): void => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void salvarTitulo(r);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelarRenomear();
      }
    },
    [salvarTitulo, cancelarRenomear],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    const root = scrollRef.current;
    if (el === null || root === null || !temMais || aoCarregarMais === undefined) return;
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) aoCarregarMais();
      },
      { root, rootMargin: '120px', threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [temMais, aoCarregarMais, registros.length]);

  return (
    <div className="tabela-envolto" ref={scrollRef}>
      <table className="tabela">
        <thead>
          <tr>
            {temImagem && <th aria-label="Foto" />}
            <th>Título</th>
            {colecao.campos.map((c) => (
              <th key={c.id}>{c.nome}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden="true">
              <td colSpan={colunas} style={{ height: paddingTop, padding: 0, border: 0 }} />
            </tr>
          )}
          {itens.map((item) => {
            const r = registros[item.index];
            if (r === undefined) return null;
            return (
              <LinhaTabela
                key={r.id}
                r={r}
                colecao={colecao}
                temImagem={temImagem}
                campoTitulo={campoTitulo}
                edicao={edicao}
                rascunho={rascunho}
                renomeando={renomeandoId === r.id}
                rascunhoTitulo={rascunhoTitulo}
                salvandoTitulo={salvandoTitulo}
                erroTitulo={renomeandoId === r.id ? erroTitulo : null}
                aoAbrirFicha={aoAbrirFicha}
                iniciar={iniciar}
                setRascunho={setRascunho}
                comitar={() => void comitarValor()}
                iniciarRenomear={iniciarRenomear}
                setRascunhoTitulo={setRascunhoTitulo}
                aoTeclarTitulo={aoTeclarTitulo}
                salvarTitulo={(reg) => void salvarTitulo(reg)}
                cancelarRenomear={cancelarRenomear}
              />
            );
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden="true">
              <td colSpan={colunas} style={{ height: paddingBottom, padding: 0, border: 0 }} />
            </tr>
          )}
          {temMais && (
            <tr ref={sentinelRef}>
              <td
                colSpan={colunas}
                style={{ textAlign: 'center', color: 'var(--tinta-3)', fontSize: 12 }}
              >
                {carregandoMais ? 'Carregando…' : ''}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
