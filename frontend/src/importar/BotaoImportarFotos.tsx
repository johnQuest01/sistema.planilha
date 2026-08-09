import { useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import type { Colecao, Registro } from '../../../shared/tipos';
import { Botao } from '../ui/Botao';
import {
  ehArquivoImagem,
  importarNaColecao,
  importarNoRegistro,
  resumoRelatorio,
  type ProgressoImport,
} from './importarFotos';

interface Props {
  colecao: Colecao;
  /** Quando presente, importa NESTE registro (a foto de cor não precisa da
   *  referência no nome). Sem ele, importa na coleção inteira (distribui pela
   *  referência do nome do arquivo). */
  registro?: Registro;
  /** Reflete os registros atualizados na lista/ficha do pai. */
  aoConcluir: (atualizados: Registro[]) => void;
  /** Roda antes de importar (ex.: salvar edições pendentes da ficha). */
  aoAntes?: () => Promise<void>;
  rotulo?: string;
}

// Botão "Importar fotos": abre o seletor de arquivos, distribui as fotos pelos
// blocos certos a partir do nome (ver importarFotos.ts) e mostra um resumo.
export function BotaoImportarFotos({ colecao, registro, aoConcluir, aoAntes, rotulo }: Props): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const [progresso, setProgresso] = useState<ProgressoImport | null>(null);
  const [resumo, setResumo] = useState<string | null>(null);

  async function aoEscolher(files: FileList | null): Promise<void> {
    const arquivos = Array.from(files ?? []).filter(ehArquivoImagem);
    if (arquivos.length === 0) return;
    setOcupado(true);
    setResumo(null);
    setProgresso({ feito: 0, total: arquivos.length });
    try {
      if (aoAntes !== undefined) await aoAntes();
      if (registro !== undefined) {
        const r = await importarNoRegistro(colecao, registro, arquivos, setProgresso);
        aoConcluir([r.registro]);
        setResumo(resumoRelatorio(r.relatorio));
      } else {
        const r = await importarNaColecao(colecao, arquivos, setProgresso);
        aoConcluir(r.atualizados);
        setResumo(resumoRelatorio(r.relatorio));
      }
    } catch {
      setResumo('Não foi possível importar as fotos. Tente novamente.');
    } finally {
      setOcupado(false);
      setProgresso(null);
      if (inputRef.current !== null) inputRef.current.value = '';
    }
  }

  const texto =
    ocupado && progresso !== null
      ? `Importando ${progresso.feito}/${progresso.total}…`
      : (rotulo ?? 'Importar fotos');

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*"
        hidden
        onChange={(e) => void aoEscolher(e.target.files)}
      />
      <Botao
        variante="padrao"
        onClick={() => inputRef.current?.click()}
        disabled={ocupado}
        title="Importar fotos pelo nome (ex.: 4621.png = referência; 4874vermelho.png ou 4784.vermelho.png = cor)"
      >
        <ImagePlus size={18} />
        {texto}
      </Botao>
      {resumo !== null && <span className="importar-resumo">{resumo}</span>}
    </>
  );
}
