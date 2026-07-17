import { Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { ErroApi } from '../api/cliente';
import { TIPOS_CAMPO, TIPOS_SUBCAMPO } from '../../../shared/tipos';
import type { ConfigCampo, SubCampo, TipoCampo, TipoSubCampo } from '../../../shared/tipos';
import { Botao } from '../ui/Botao';
import { Chip } from '../ui/Chip';
import { IconeTipo, ROTULO_TIPO } from '../ui/IconeTipo';
import './colecao.css';

export interface DadosBloco {
  nome: string;
  tipo: TipoCampo;
  config: ConfigCampo;
}

// Estado de edição de um subcampo (quadradinho da seção) antes de virar SubCampo.
interface RascunhoSub {
  id: string;
  nome: string;
  tipo: TipoSubCampo;
  sufixo: string;
  opcoesTexto: string;
  maxFotos: number;
}

function subDeCampo(s?: SubCampo): RascunhoSub {
  return {
    id: s?.id ?? crypto.randomUUID(),
    nome: s?.nome ?? '',
    tipo: s?.tipo ?? 'texto',
    sufixo: s?.config.sufixo ?? '',
    opcoesTexto: (s?.config.opcoes ?? []).join(', '),
    maxFotos: s?.config.maxFotos ?? 1,
  };
}

// Form de bloco reutilizado no "adicionar" (encadeia), no "editar" (fecha ao salvar)
// e no "preencher" (adicionar campo na hora).
export function FormBloco({
  inicial,
  textoAcao,
  encadear,
  autoFoco = false,
  aoSalvar,
  aoCancelar,
}: {
  inicial: DadosBloco;
  textoAcao: string;
  encadear: boolean;
  autoFoco?: boolean;
  aoSalvar: (d: DadosBloco) => Promise<void>;
  aoCancelar?: () => void;
}): JSX.Element {
  const [titulo, setTitulo] = useState(inicial.config.titulo ?? '');
  const [nome, setNome] = useState(inicial.nome);
  const [tipo, setTipo] = useState<TipoCampo>(inicial.tipo);
  const [sufixo, setSufixo] = useState(inicial.config.sufixo ?? '');
  const [opcoesTexto, setOpcoesTexto] = useState((inicial.config.opcoes ?? []).join(', '));
  const [maxFotos, setMaxFotos] = useState(inicial.config.maxFotos ?? 1);
  const [autoAgora, setAutoAgora] = useState(inicial.config.autoAgora === true);
  const [subcampos, setSubcampos] = useState<RascunhoSub[]>(
    (inicial.config.subcampos ?? []).map((s) => subDeCampo(s)),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const nomeRef = useRef<HTMLInputElement>(null);

  function montarConfig(): ConfigCampo {
    // Título opcional vale para QUALQUER tipo: começa como base e recebe o resto.
    const config: ConfigCampo = {};
    if (titulo.trim() !== '') config.titulo = titulo.trim();

    if (tipo === 'numero' && sufixo.trim() !== '') config.sufixo = sufixo.trim();
    if (tipo === 'selecao') {
      config.opcoes = opcoesTexto
        .split(',')
        .map((o) => o.trim())
        .filter((o) => o !== '');
    }
    if (tipo === 'imagem') config.maxFotos = maxFotos;
    if ((tipo === 'data' || tipo === 'datahora') && autoAgora) config.autoAgora = true;
    if (tipo === 'secao') {
      config.subcampos = subcampos.map((s) => {
        const cfg: ConfigCampo = {};
        if (s.tipo === 'numero' && s.sufixo.trim() !== '') cfg.sufixo = s.sufixo.trim();
        if (s.tipo === 'selecao') {
          cfg.opcoes = s.opcoesTexto
            .split(',')
            .map((o) => o.trim())
            .filter((o) => o !== '');
        }
        if (s.tipo === 'imagem') cfg.maxFotos = s.maxFotos;
        return { id: s.id, nome: s.nome.trim(), tipo: s.tipo, config: cfg };
      });
    }
    return config;
  }

  function alterarSub(id: string, mudanca: Partial<RascunhoSub>): void {
    setSubcampos((atual) => atual.map((s) => (s.id === id ? { ...s, ...mudanca } : s)));
  }

  async function salvar(): Promise<void> {
    const limpo = nome.trim();
    if (limpo === '') {
      setErro('dê um nome ao bloco');
      nomeRef.current?.focus();
      return;
    }
    if (tipo === 'selecao') {
      const opcoes = opcoesTexto.split(',').map((o) => o.trim()).filter((o) => o !== '');
      if (opcoes.length === 0) {
        setErro('adicione ao menos uma opção');
        return;
      }
    }
    if (tipo === 'secao') {
      if (subcampos.length === 0) {
        setErro('adicione ao menos um campo à seção');
        return;
      }
      if (subcampos.some((s) => s.nome.trim() === '')) {
        setErro('dê um nome a cada campo da seção');
        return;
      }
      const selSemOpcao = subcampos.some(
        (s) => s.tipo === 'selecao' && s.opcoesTexto.split(',').every((o) => o.trim() === ''),
      );
      if (selSemOpcao) {
        setErro('cada campo de seleção precisa de ao menos uma opção');
        return;
      }
    }
    const config = montarConfig();
    setSalvando(true);
    setErro(null);
    try {
      await aoSalvar({ nome: limpo, tipo, config });
      if (encadear) {
        // encadeamento estilo Excel: limpa e reabre com foco no nome
        setTitulo('');
        setNome('');
        setSufixo('');
        setOpcoesTexto('');
        setMaxFotos(1);
        setAutoAgora(false);
        setSubcampos([]);
        nomeRef.current?.focus();
      }
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'não foi possível salvar');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="add-bloco">
      <input
        className="campo__controle add-bloco__titulo"
        placeholder="Título acima do bloco (opcional)"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void salvar();
          }
          if (e.key === 'Escape' && aoCancelar !== undefined) aoCancelar();
        }}
      />
      <input
        ref={nomeRef}
        className="campo__controle"
        placeholder="Nome do bloco"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void salvar();
          }
          if (e.key === 'Escape' && aoCancelar !== undefined) aoCancelar();
        }}
        autoFocus={autoFoco}
      />

      <div className="add-bloco__tipos">
        {TIPOS_CAMPO.map((t) => (
          <Chip key={t} ativo={t === tipo} onClick={() => setTipo(t)}>
            <IconeTipo tipo={t} size={15} />
            {ROTULO_TIPO[t]}
          </Chip>
        ))}
      </div>

      {tipo === 'numero' && (
        <input
          className="campo__controle"
          placeholder="Unidade (ex.: kg, R$, m)"
          value={sufixo}
          onChange={(e) => setSufixo(e.target.value)}
        />
      )}
      {tipo === 'selecao' && (
        <input
          className="campo__controle"
          placeholder="Opções separadas por vírgula"
          value={opcoesTexto}
          onChange={(e) => setOpcoesTexto(e.target.value)}
        />
      )}
      {tipo === 'imagem' && (
        <label className="campo">
          <span className="campo__rotulo">Máximo de fotos</span>
          <input
            className="campo__controle"
            type="number"
            min={1}
            max={10}
            value={maxFotos}
            onChange={(e) => setMaxFotos(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
          />
        </label>
      )}
      {(tipo === 'data' || tipo === 'datahora') && (
        <label className="add-bloco__auto">
          <input
            type="checkbox"
            checked={autoAgora}
            onChange={(e) => setAutoAgora(e.target.checked)}
          />
          <span>
            Preencher automaticamente com {tipo === 'datahora' ? 'a data e hora' : 'a data'} atual ao
            criar o registro
          </span>
        </label>
      )}

      {tipo === 'secao' && (
        <div className="secao-builder">
          <span className="campo__rotulo">Campos da seção (quadradinhos que se repetem)</span>
          {subcampos.map((s) => (
            <div key={s.id} className="secao-builder__item">
              <div className="secao-builder__linha">
                <input
                  className="campo__controle"
                  placeholder="Nome do campo (ex.: Cor)"
                  value={s.nome}
                  onChange={(e) => alterarSub(s.id, { nome: e.target.value })}
                />
                <select
                  className="campo__controle secao-builder__tipo"
                  value={s.tipo}
                  onChange={(e) => alterarSub(s.id, { tipo: e.target.value as TipoSubCampo })}
                >
                  {TIPOS_SUBCAMPO.map((t) => (
                    <option key={t} value={t}>
                      {ROTULO_TIPO[t]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn--icone"
                  aria-label="Remover campo da seção"
                  onClick={() => setSubcampos((atual) => atual.filter((x) => x.id !== s.id))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {s.tipo === 'numero' && (
                <input
                  className="campo__controle"
                  placeholder="Unidade (ex.: kg, R$, m)"
                  value={s.sufixo}
                  onChange={(e) => alterarSub(s.id, { sufixo: e.target.value })}
                />
              )}
              {s.tipo === 'selecao' && (
                <input
                  className="campo__controle"
                  placeholder="Opções separadas por vírgula"
                  value={s.opcoesTexto}
                  onChange={(e) => alterarSub(s.id, { opcoesTexto: e.target.value })}
                />
              )}
              {s.tipo === 'imagem' && (
                <label className="campo">
                  <span className="campo__rotulo">Máximo de fotos por linha</span>
                  <input
                    className="campo__controle"
                    type="number"
                    min={1}
                    max={10}
                    value={s.maxFotos}
                    onChange={(e) =>
                      alterarSub(s.id, {
                        maxFotos: Math.min(10, Math.max(1, Number(e.target.value) || 1)),
                      })
                    }
                  />
                </label>
              )}
            </div>
          ))}
          <Botao
            variante="fantasma"
            onClick={() => setSubcampos((atual) => [...atual, subDeCampo()])}
          >
            + Adicionar campo à seção
          </Botao>
        </div>
      )}

      {erro !== null && <p className="aviso-erro">{erro}</p>}

      <div className="add-bloco__acoes">
        <Botao variante="primario" onClick={() => void salvar()} disabled={salvando}>
          {textoAcao}
        </Botao>
        {aoCancelar !== undefined && (
          <Botao variante="fantasma" onClick={aoCancelar}>
            Cancelar
          </Botao>
        )}
      </div>
    </div>
  );
}
