import { useRef, useState } from 'react';
import { Images, Sparkles } from 'lucide-react';
import { api, ErroApi, type ColecaoResumo } from '../api/cliente';
import { Botao } from '../ui/Botao';
import { FolhaInferior } from '../ui/FolhaInferior';
import {
  ehArquivoImagem,
  importarNaColecao,
  MAX_FOTOS_LOTE,
  resumoRelatorio,
  type ProgressoImport,
} from './importarFotos';
import './importar.css';

interface Props {
  colecoes: ColecaoResumo[];
  aoConcluir?: () => void;
}

/**
 * Na Home: escolhe planilha(s) e joga fotos em massa (até 100).
 * Usa a mesma lógica de renomear/encaixar por referência de dentro da planilha.
 */
export function BotaoConversaoHome({ colecoes, aoConcluir }: Props): JSX.Element {
  const [aberto, setAberto] = useState(false);
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const [progresso, setProgresso] = useState<ProgressoImport | null>(null);
  const [resumo, setResumo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ativas = colecoes.filter((c) => !c.arquivada && !c.bloqueada);

  function toggle(id: string): void {
    setEscolhidas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function fechar(): void {
    if (ocupado) return;
    setAberto(false);
    setResumo(null);
    setErro(null);
    setProgresso(null);
  }

  async function aoEscolher(files: FileList | null): Promise<void> {
    let arquivos = Array.from(files ?? []).filter(ehArquivoImagem);
    if (arquivos.length === 0 || escolhidas.size === 0) return;
    if (arquivos.length > MAX_FOTOS_LOTE) {
      arquivos = arquivos.slice(0, MAX_FOTOS_LOTE);
    }

    setOcupado(true);
    setErro(null);
    setResumo(null);
    setProgresso({ feito: 0, total: arquivos.length * escolhidas.size });

    const partes: string[] = [];
    let feitoGlobal = 0;
    const totalGlobal = arquivos.length * escolhidas.size;

    try {
      for (const id of escolhidas) {
        const col = await api.obterColecao(id);
        const r = await importarNaColecao(col, arquivos, (p) => {
          // Progresso aproximado somando planilhas.
          const base = feitoGlobal;
          setProgresso({
            feito: Math.min(totalGlobal, base - (p.total - p.feito) + p.feito),
            total: totalGlobal,
          });
        });
        feitoGlobal += arquivos.length;
        partes.push(`${col.nome}: ${resumoRelatorio(r.relatorio)}`);
      }
      setResumo(partes.join(' · '));
      aoConcluir?.();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'falha ao importar fotos');
    } finally {
      setOcupado(false);
      setProgresso(null);
      if (inputRef.current !== null) inputRef.current.value = '';
    }
  }

  return (
    <>
      <Botao
        variante="padrao"
        onClick={() => setAberto(true)}
        title="Converter / importar fotos por referência nas planilhas"
      >
        <Sparkles size={18} />
        Converter fotos
      </Botao>

      {aberto && (
        <FolhaInferior titulo="Converter / importar fotos" onFechar={fechar}>
          <div className="importar-zip">
            <p className="importar-zip__ajuda">
              Escolha a(s) planilha(s). As fotos (até {MAX_FOTOS_LOTE}) são encaixadas pelo nome da
              referência — igual ao importar dentro da planilha.
            </p>
            <ul className="importar-lista-colecoes">
              {ativas.map((c) => (
                <li key={c.id}>
                  <label className="importar-check">
                    <input
                      type="checkbox"
                      checked={escolhidas.has(c.id)}
                      onChange={() => toggle(c.id)}
                      disabled={ocupado}
                    />
                    <span>{c.nome}</span>
                  </label>
                </li>
              ))}
            </ul>
            {ativas.length === 0 && (
              <p className="aviso-erro">Nenhuma planilha disponível (desbloqueie ou crie uma).</p>
            )}
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*"
              hidden
              onChange={(e) => void aoEscolher(e.target.files)}
            />
            <Botao
              variante="primario"
              disabled={ocupado || escolhidas.size === 0}
              onClick={() => inputRef.current?.click()}
            >
              <Images size={18} />
              {ocupado && progresso !== null
                ? `Enviando ${progresso.feito}/${progresso.total}…`
                : 'Escolher fotos'}
            </Botao>
            {resumo !== null && <p className="importar-resumo">{resumo}</p>}
            {erro !== null && <p className="aviso-erro">{erro}</p>}
          </div>
        </FolhaInferior>
      )}
    </>
  );
}
