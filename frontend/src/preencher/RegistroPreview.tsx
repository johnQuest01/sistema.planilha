import { useEffect, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { api, ErroApi } from '../api/cliente';
import type { Campo, Colecao, Registro, SubCampo } from '../../../shared/tipos';
import { Visor } from '../imagens/Visor';
import { urlCheia } from '../imagens/urls';
import {
  campoTituloDoRegistro,
  formatarValor,
  keysDoCampo,
  textoDe,
  tituloDoRegistro,
} from './derivarResumo';
import { linhasDe } from './SecaoEditor';

interface Props {
  colecao: Colecao;
  registro: Registro;
  aoAbrir?: () => void;
  aoAtualizar?: (r: Registro) => void;
}

function keysDe(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((k): k is string => typeof k === 'string') : [];
}

function GradeFotos({
  keys,
  aoAbrirVisor,
}: {
  keys: string[];
  aoAbrirVisor: (indice: number) => void;
}): JSX.Element {
  if (keys.length === 0) {
    return <span className="preview-valor preview-valor--vazio">—</span>;
  }
  return (
    <div className="preview-imagens">
      {keys.map((k, i) => (
        <button
          key={k}
          type="button"
          className="preview-imagens__botao"
          onClick={() => aoAbrirVisor(i)}
          aria-label={`Ver foto ${i + 1} de ${keys.length}`}
        >
          <img className="preview-imagens__foto" src={urlCheia(k)} alt="" loading="lazy" />
        </button>
      ))}
    </div>
  );
}

function formatarSubTexto(sub: SubCampo, valor: unknown): string {
  if (sub.tipo === 'imagem') return '';
  const fake: Campo = {
    id: sub.id,
    colecaoId: '',
    nome: sub.nome,
    tipo: sub.tipo,
    ordem: 0,
    config: sub.config,
  };
  return formatarValor(fake, valor).trim();
}

function ValorCampo({
  campo,
  registro,
  aoAbrirVisor,
}: {
  campo: Campo;
  registro: Registro;
  aoAbrirVisor: (keys: string[], indice: number) => void;
}): JSX.Element {
  const valor = registro.valores[campo.id];

  if (campo.tipo === 'imagem') {
    const keys = keysDoCampo(registro, campo.id);
    return <GradeFotos keys={keys} aoAbrirVisor={(i) => aoAbrirVisor(keys, i)} />;
  }

  if (campo.tipo === 'secao') {
    const linhas = linhasDe(valor);
    const subs = campo.config.subcampos ?? [];
    if (linhas.length === 0) {
      return <span className="preview-valor preview-valor--vazio">—</span>;
    }
    return (
      <div className="preview-secao">
        {linhas.map((linha, i) => (
          <div key={i} className="preview-secao__linha">
            <span className="preview-secao__num">#{i + 1}</span>
            <div className="preview-secao__celulas">
              {subs.map((s) => {
                // Sempre lista TODOS os subcampos (aviamentos, etc.) — vazio vira "—".
                if (s.tipo === 'imagem') {
                  const keys = keysDe(linha[s.id]);
                  return (
                    <div key={s.id} className="preview-secao__celula preview-secao__celula--foto">
                      <span className="preview-secao__subnome">{s.nome}</span>
                      <GradeFotos keys={keys} aoAbrirVisor={(idx) => aoAbrirVisor(keys, idx)} />
                    </div>
                  );
                }
                const txt = formatarSubTexto(s, linha[s.id]);
                return (
                  <div key={s.id} className="preview-secao__celula">
                    <span className="preview-secao__subnome">{s.nome}</span>
                    <span className={`preview-valor${txt === '' ? ' preview-valor--vazio' : ''}`}>
                      {txt === '' ? '—' : txt}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const txt = formatarValor(campo, valor).trim();
  if (txt === '') {
    return <span className="preview-valor preview-valor--vazio">—</span>;
  }
  return <span className="preview-valor">{txt}</span>;
}

export function RegistroPreview({
  colecao,
  registro,
  aoAbrir,
  aoAtualizar,
}: Props): JSX.Element {
  const campoTitulo = campoTituloDoRegistro(colecao.campos);
  const [local, setLocal] = useState(registro);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroNome, setErroNome] = useState<string | null>(null);
  const [visor, setVisor] = useState<{ keys: string[]; indice: number } | null>(null);

  useEffect(() => {
    setLocal(registro);
  }, [registro]);

  function iniciarEdicao(): void {
    if (campoTitulo === undefined || aoAtualizar === undefined) return;
    setEditando(true);
    setRascunho(textoDe(local.valores[campoTitulo.id]));
    setErroNome(null);
  }

  function cancelarEdicao(): void {
    setEditando(false);
    setErroNome(null);
  }

  async function salvarNome(): Promise<void> {
    if (campoTitulo === undefined || aoAtualizar === undefined || !editando || salvando) return;
    const atual = textoDe(local.valores[campoTitulo.id]);
    const novo = rascunho.trim();
    if (novo === atual.trim()) {
      setEditando(false);
      return;
    }
    setSalvando(true);
    setErroNome(null);
    try {
      const atualizado = await api.editarRegistro(local.id, { [campoTitulo.id]: novo });
      setLocal(atualizado);
      aoAtualizar(atualizado);
      setEditando(false);
    } catch (e) {
      setErroNome(e instanceof ErroApi ? e.message : 'não foi possível salvar o nome');
    } finally {
      setSalvando(false);
    }
  }

  function aoTeclar(e: ReactKeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      void salvarNome();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelarEdicao();
    }
  }

  const tituloAtual = tituloDoRegistro(colecao.campos, local);

  return (
    <article className="preview-registro preview-registro--completo">
      <div className="preview-registro__cabecalho">
        <div className="preview-registro__cabecalho-linha">
          {editando ? (
            <div className="preview-registro__renomear-box">
              <input
                className="campo__controle preview-registro__nome-input"
                value={rascunho}
                autoFocus
                aria-label="Nome do registro"
                disabled={salvando}
                onChange={(e) => setRascunho(e.target.value)}
                onKeyDown={aoTeclar}
              />
              <div className="preview-registro__renomear-acoes">
                <button
                  type="button"
                  className="lista-item__salvar"
                  disabled={salvando}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void salvarNome()}
                >
                  {salvando ? 'Salvando…' : 'Salvar'}
                </button>
                <button
                  type="button"
                  className="lista-item__cancelar"
                  disabled={salvando}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={cancelarEdicao}
                >
                  Cancelar
                </button>
              </div>
              {erroNome !== null && <p className="aviso-erro">{erroNome}</p>}
            </div>
          ) : (
            <h3 className="preview-registro__titulo">{tituloAtual}</h3>
          )}
          {campoTitulo !== undefined && aoAtualizar !== undefined && !editando && (
            <button
              type="button"
              className="preview-registro__renomear"
              onClick={iniciarEdicao}
            >
              Renomear
            </button>
          )}
        </div>
        {aoAbrir !== undefined && !editando && (
          <button type="button" className="preview-registro__acao" onClick={aoAbrir}>
            Editar
          </button>
        )}
      </div>

      <div className="preview-campos">
        {colecao.campos.map((campo) => (
          <div key={campo.id} className="preview-campo">
            {campo.config.titulo !== undefined && campo.config.titulo !== '' && (
              <span className="preview-campo__titulo-bloco">{campo.config.titulo}</span>
            )}
            <span className="preview-campo__nome">{campo.nome}</span>
            <ValorCampo
              campo={campo}
              registro={local}
              aoAbrirVisor={(keys, indice) => setVisor({ keys, indice })}
            />
          </div>
        ))}
      </div>

      {local.criadoPor !== null && local.criadoPor !== '' && (
        <p className="preview-meta">Preenchido por {local.criadoPor}</p>
      )}

      {visor !== null && (
        <Visor
          keys={visor.keys}
          indiceInicial={visor.indice}
          aoFechar={() => setVisor(null)}
        />
      )}
    </article>
  );
}
