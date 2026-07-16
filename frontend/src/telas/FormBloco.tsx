import { useRef, useState } from 'react';
import { ErroApi } from '../api/cliente';
import { TIPOS_CAMPO } from '../../../shared/tipos';
import type { ConfigCampo, TipoCampo } from '../../../shared/tipos';
import { Botao } from '../ui/Botao';
import { Chip } from '../ui/Chip';
import { IconeTipo, ROTULO_TIPO } from '../ui/IconeTipo';
import './colecao.css';

export interface DadosBloco {
  nome: string;
  tipo: TipoCampo;
  config: ConfigCampo;
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
  const [nome, setNome] = useState(inicial.nome);
  const [tipo, setTipo] = useState<TipoCampo>(inicial.tipo);
  const [sufixo, setSufixo] = useState(inicial.config.sufixo ?? '');
  const [opcoesTexto, setOpcoesTexto] = useState((inicial.config.opcoes ?? []).join(', '));
  const [maxFotos, setMaxFotos] = useState(inicial.config.maxFotos ?? 1);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const nomeRef = useRef<HTMLInputElement>(null);

  function montarConfig(): ConfigCampo {
    if (tipo === 'numero') return sufixo.trim() === '' ? {} : { sufixo: sufixo.trim() };
    if (tipo === 'selecao') {
      const opcoes = opcoesTexto
        .split(',')
        .map((o) => o.trim())
        .filter((o) => o !== '');
      return { opcoes };
    }
    if (tipo === 'imagem') return { maxFotos };
    return {};
  }

  async function salvar(): Promise<void> {
    const limpo = nome.trim();
    if (limpo === '') {
      setErro('dê um nome ao bloco');
      nomeRef.current?.focus();
      return;
    }
    const config = montarConfig();
    if (tipo === 'selecao' && (config.opcoes?.length ?? 0) === 0) {
      setErro('adicione ao menos uma opção');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await aoSalvar({ nome: limpo, tipo, config });
      if (encadear) {
        // encadeamento estilo Excel: limpa e reabre com foco no nome
        setNome('');
        setSufixo('');
        setOpcoesTexto('');
        setMaxFotos(1);
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
