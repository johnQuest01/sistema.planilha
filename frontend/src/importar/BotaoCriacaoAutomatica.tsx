import { useRef, useState } from 'react';
import { ImagePlus, Sparkles } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { Campo } from '../ui/Campo';
import { FolhaInferior } from '../ui/FolhaInferior';
import {
  criarPlanilhaAutomatica,
  linhasEstoqueAjuda,
  resumoAuto,
  type ProgressoAuto,
} from './criacaoAutomatica';
import { ehArquivoImagem } from './importarFotos';
import './importar.css';

interface Props {
  aoImportado: (colecaoId: string) => void;
}

// Botão "Criação automático": cola o texto (de qualquer lugar), dá um nome e cria a
// planilha com um registro por nota. Opcionalmente já anexa imagens do celular, que
// são distribuídas pelo nome (referência) — as sem nome ficam embaixo.
export function BotaoCriacaoAutomatica({ aoImportado }: Props): JSX.Element {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [texto, setTexto] = useState('');
  const [imagens, setImagens] = useState<File[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<ProgressoAuto | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function fechar(): void {
    if (ocupado) return;
    setAberto(false);
    setNome('');
    setTexto('');
    setImagens([]);
    setErro(null);
    setResumo(null);
  }

  async function criar(): Promise<void> {
    const limpo = nome.trim();
    if (limpo === '' || texto.trim() === '' || ocupado) return;
    setOcupado(true);
    setErro(null);
    setResumo(null);
    try {
      const r = await criarPlanilhaAutomatica(limpo, texto, imagens, setProgresso);
      setResumo(resumoAuto(r.relatorio));
      aoImportado(r.colecaoId);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível criar a planilha');
    } finally {
      setOcupado(false);
      setProgresso(null);
    }
  }

  function textoProgresso(p: ProgressoAuto | null): string {
    if (p === null) return 'Criando…';
    if (p.fase === 'criando') return `Criando registros ${p.feito}/${p.total}…`;
    return `Enviando fotos ${p.feito}/${p.total}…`;
  }

  return (
    <>
      <Botao variante="padrao" className="btn--compacto" onClick={() => setAberto(true)}>
        <Sparkles size={15} /> Criação automático
      </Botao>
      {aberto && (
        <FolhaInferior titulo="Criação automático" onFechar={fechar}>
          <div className="importar-zip">
            <p className="importar-zip__ajuda">
              Cole um texto. Cada <strong>ponto final</strong> (.) — ou item numerado{' '}
              (<code>1 …</code> <code>2 …</code>) — vira um <strong>bloco</strong> no registro.
              Vários registros: separe com uma linha só com <code>---</code>. Imagens (opcional)
              entram pelo <strong>nome do arquivo</strong> (ex.: <code>4785.png</code>,{' '}
              <code>cor.rosa.png</code>).
            </p>

            <div className="criacao-estoque">
              <p className="criacao-estoque__titulo">Estoque — o que escrever → o que aparece</p>
              <ul className="criacao-estoque__lista">
                {linhasEstoqueAjuda().map((l) => (
                  <li key={l.escreve}>
                    <code>{l.escreve}</code>
                    <span aria-hidden> → </span>
                    <strong>{l.vira}</strong>
                  </li>
                ))}
              </ul>
            </div>

            <Campo
              rotulo="Nome da planilha"
              placeholder="Ex.: Pedidos de hoje"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              disabled={ocupado}
              autoFocus
            />

            <Campo
              multilinha
              rows={10}
              rotulo="Cole o texto aqui"
              placeholder={
                '4785 bory. cor: rosa. modelagem. tecido: algodão. observação:\n---\n4786 curto. cor: azul. caderno.'
              }
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              disabled={ocupado}
            />

            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*"
              hidden
              onChange={(e) => setImagens(Array.from(e.target.files ?? []).filter(ehArquivoImagem))}
            />
            <Botao variante="padrao" onClick={() => inputRef.current?.click()} disabled={ocupado}>
              <ImagePlus size={16} />
              {imagens.length === 0 ? 'Selecionar imagens (opcional)' : `${imagens.length} imagem(ns) selecionada(s)`}
            </Botao>

            {erro !== null && <p className="aviso-erro">{erro}</p>}
            {resumo !== null && <p className="importar-zip__ajuda">{resumo}</p>}

            <Botao
              variante="primario"
              onClick={() => void criar()}
              disabled={ocupado || nome.trim() === '' || texto.trim() === ''}
            >
              {ocupado ? textoProgresso(progresso) : 'Criar planilha automaticamente'}
            </Botao>
          </div>
        </FolhaInferior>
      )}
    </>
  );
}
