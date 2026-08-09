import { useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { Campo } from '../ui/Campo';
import { FolhaInferior } from '../ui/FolhaInferior';
import { importarPlanilhaDeZip, type ProgressoImportTexto } from './importarTexto';
import './importar.css';

interface Props {
  aoImportado: (colecaoId: string) => void;
}

// Botão + folha para criar uma planilha a partir de um .zip (texto + imagens).
// Pede o NOME antes de aceitar o arquivo, como combinado.
export function BotaoImportarZip({ aoImportado }: Props): JSX.Element {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<ProgressoImportTexto | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function fechar(): void {
    if (ocupado) return; // não fecha no meio da importação
    setAberto(false);
    setNome('');
    setArquivo(null);
    setErro(null);
  }

  async function importar(): Promise<void> {
    const limpo = nome.trim();
    if (limpo === '' || arquivo === null || ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await importarPlanilhaDeZip(limpo, arquivo, setProgresso);
      aoImportado(r.colecaoId);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível importar o arquivo');
    } finally {
      setOcupado(false);
      setProgresso(null);
    }
  }

  function textoProgresso(p: ProgressoImportTexto | null): string {
    if (p === null) return 'Importando…';
    if (p.fase === 'lendo') return 'Lendo o arquivo…';
    if (p.fase === 'criando') return 'Criando a planilha…';
    return `Criando registros ${p.feito}/${p.total}…`;
  }

  return (
    <>
      <Botao variante="padrao" onClick={() => setAberto(true)}>
        <FileUp size={18} /> Importar de arquivo
      </Botao>
      {aberto && (
        <FolhaInferior titulo="Importar planilha de um arquivo" onFechar={fechar}>
          <div className="importar-zip">
            <p className="importar-zip__ajuda">
              Envie um <strong>.zip</strong> com um arquivo de texto (<code>.txt</code> ou{' '}
              <code>.md</code>) e as imagens. Separe cada registro com uma linha{' '}
              <code>---</code>. Para anexar uma imagem, escreva o nome do arquivo (ex.:{' '}
              <code>4621.jpg</code>) na ordem certa, ou use <code>![](4621.jpg)</code>.
            </p>

            <Campo
              rotulo="Nome da planilha"
              placeholder="Ex.: Coleção Verão"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              disabled={ocupado}
              autoFocus
            />

            <input
              ref={inputRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              hidden
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
            <Botao variante="padrao" onClick={() => inputRef.current?.click()} disabled={ocupado}>
              <FileUp size={16} />
              {arquivo === null ? 'Escolher arquivo .zip' : arquivo.name}
            </Botao>

            {erro !== null && <p className="aviso-erro">{erro}</p>}

            <Botao
              variante="primario"
              onClick={() => void importar()}
              disabled={ocupado || nome.trim() === '' || arquivo === null}
            >
              {ocupado ? textoProgresso(progresso) : 'Criar planilha e importar'}
            </Botao>
          </div>
        </FolhaInferior>
      )}
    </>
  );
}
