import { useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { Campo } from '../ui/Campo';
import { FolhaInferior } from '../ui/FolhaInferior';
import {
  importarArquivoBackup,
  NaoEhBackup,
  type ProgressoImportBackup,
} from './importarBackup';
import { importarPlanilhaDeZip, type ProgressoImportTexto } from './importarTexto';
import './importar.css';

interface Props {
  aoImportado: (colecaoId: string) => void;
  // Chamado quando o backup importado é de uma planilha UNIDA (integração).
  aoImportadoIntegracao?: (integracaoId: string) => void;
}

// Botão + folha para trazer uma planilha de um .zip. Aceita DOIS tipos:
//  - BACKUP (gerado pelo botão "Baixar backup"): recria a planilha (ou a planilha
//    unida) igualzinha, com corpo, valores e imagens em alta definição. Detectado
//    automaticamente (tem dados.json/integracao.json) — o nome vem de dentro.
//  - TEXTO + IMAGENS: um .txt/.md + fotos soltas; aí pedimos o NOME da planilha.
export function BotaoImportarZip({ aoImportado, aoImportadoIntegracao }: Props): JSX.Element {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function fechar(): void {
    if (ocupado) return; // não fecha no meio da importação
    setAberto(false);
    setNome('');
    setArquivo(null);
    setErro(null);
    setMsg('');
  }

  function textoBackup(p: ProgressoImportBackup): string {
    if (p.fase === 'lendo') return 'Lendo o arquivo…';
    if (p.fase === 'criando') return `Criando ${p.planilha ?? 'a planilha'}…`;
    if (p.fase === 'imagens') return `Enviando imagens… (${p.feito})`;
    return `Recriando registros ${p.feito}/${p.total}${p.planilha ? ` — ${p.planilha}` : ''}…`;
  }
  function textoTexto(p: ProgressoImportTexto): string {
    if (p.fase === 'lendo') return 'Lendo o arquivo…';
    if (p.fase === 'criando') return 'Criando a planilha…';
    return `Criando registros ${p.feito}/${p.total}…`;
  }

  async function importar(): Promise<void> {
    if (arquivo === null || ocupado) return;
    setOcupado(true);
    setErro(null);
    setMsg('Lendo o arquivo…');
    try {
      const res = await importarArquivoBackup(arquivo, (p) => setMsg(textoBackup(p)));
      if (res.tipo === 'integracao') {
        if (res.integracaoId !== undefined && aoImportadoIntegracao !== undefined) {
          aoImportadoIntegracao(res.integracaoId);
        } else {
          setErro(
            res.integracaoId === undefined
              ? `Recriei ${res.planilhas} planilha(s), mas não consegui refazer a união. Veja em Integrações.`
              : 'Backup importado.',
          );
        }
      } else if (res.colecaoId !== undefined) {
        aoImportado(res.colecaoId);
      }
    } catch (e) {
      if (e instanceof NaoEhBackup) {
        // .zip comum (texto + imagens): usa o importador de texto — aí precisa do nome.
        const limpo = nome.trim();
        if (limpo === '') {
          setErro('Este .zip não é um backup. Digite o nome da planilha para importar como texto + imagens.');
        } else {
          try {
            const r = await importarPlanilhaDeZip(limpo, arquivo, (p) => setMsg(textoTexto(p)));
            aoImportado(r.colecaoId);
          } catch (e2) {
            setErro(e2 instanceof Error ? e2.message : 'não foi possível importar o arquivo');
          }
        }
      } else {
        setErro(e instanceof Error ? e.message : 'não foi possível importar o arquivo');
      }
    } finally {
      setOcupado(false);
      setMsg('');
    }
  }

  return (
    <>
      <Botao variante="padrao" className="btn--compacto" onClick={() => setAberto(true)}>
        <FileUp size={15} /> Importar de arquivo
      </Botao>
      {aberto && (
        <FolhaInferior titulo="Importar de arquivo" onFechar={fechar}>
          <div className="importar-zip">
            <p className="importar-zip__ajuda">
              Envie um <strong>.zip</strong>. Se for um <strong>backup</strong> (baixado pelo
              botão “Baixar backup”), o app recria a planilha — ou a planilha unida —{' '}
              <strong>igualzinha</strong>, com blocos e imagens em alta definição (o nome vem de
              dentro do backup). Se for um .zip de <strong>texto + imagens</strong> (um{' '}
              <code>.txt</code>/<code>.md</code> e as fotos), informe o nome abaixo; separe cada
              registro com <code>---</code> e cite a imagem pelo nome do arquivo.
            </p>

            <Campo
              rotulo="Nome da planilha (só para .zip de texto)"
              placeholder="Ex.: Coleção Verão"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              disabled={ocupado}
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
              disabled={ocupado || arquivo === null}
            >
              {ocupado ? (msg === '' ? 'Importando…' : msg) : 'Importar'}
            </Botao>
          </div>
        </FolhaInferior>
      )}
    </>
  );
}
