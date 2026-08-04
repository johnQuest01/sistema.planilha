import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, ListPlus, Pencil, Trash2 } from 'lucide-react';
import type { Campo } from '../../../shared/tipos';
import { IconeTipo, ROTULO_TIPO } from '../ui/IconeTipo';
import { Botao } from '../ui/Botao';
import { FormBloco, type DadosBloco } from '../telas/FormBloco';

function subtitulo(campo: Campo): string {
  switch (campo.tipo) {
    case 'numero':
      return campo.config.sufixo !== undefined && campo.config.sufixo !== ''
        ? `Número · ${campo.config.sufixo}`
        : 'Número';
    case 'selecao': {
      const n = campo.config.opcoes?.length ?? 0;
      return `Seleção · ${n} ${n === 1 ? 'opção' : 'opções'}`;
    }
    case 'imagem': {
      const n = campo.config.maxFotos ?? 1;
      return `Imagem · até ${n} ${n === 1 ? 'foto' : 'fotos'}`;
    }
    case 'secao': {
      const n = campo.config.subcampos?.length ?? 0;
      return `Seção · ${n} ${n === 1 ? 'campo' : 'campos'}`;
    }
    default:
      return ROTULO_TIPO[campo.tipo];
  }
}

// Editor dos blocos de UM registro. Toda mudança monta o novo corpo e chama
// `aoAplicar` (que persiste no servidor tornando o registro independente). O
// estado local dá resposta imediata; ressincroniza quando `campos` muda de fora.
export function CorpoRegistroEditor({
  colecaoId,
  campos,
  aoAplicar,
  ocupado,
}: {
  colecaoId: string;
  campos: Campo[];
  aoAplicar: (novos: Campo[]) => void;
  ocupado: boolean;
}): JSX.Element {
  const [itens, setItens] = useState<Campo[]>(campos);
  const [editando, setEditando] = useState<string | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  useEffect(() => {
    setItens(campos);
  }, [campos]);

  function aplicar(novos: Campo[]): void {
    const renumerados = novos.map((c, i) => ({ ...c, ordem: i * 100 }));
    setItens(renumerados);
    aoAplicar(renumerados);
  }

  function mover(id: string, dir: 'cima' | 'baixo'): void {
    const idx = itens.findIndex((c) => c.id === id);
    const alvo = dir === 'cima' ? idx - 1 : idx + 1;
    if (idx < 0 || alvo < 0 || alvo >= itens.length) return;
    const copia = [...itens];
    const [item] = copia.splice(idx, 1);
    if (item === undefined) return;
    copia.splice(alvo, 0, item);
    aplicar(copia);
  }

  function remover(id: string): void {
    setConfirmando(null);
    aplicar(itens.filter((c) => c.id !== id));
  }

  function salvarEdicao(id: string, d: DadosBloco): void {
    aplicar(itens.map((c) => (c.id === id ? { ...c, nome: d.nome, tipo: d.tipo, config: d.config } : c)));
    setEditando(null);
  }

  function adicionar(d: DadosBloco): void {
    const novo: Campo = {
      id: crypto.randomUUID(),
      colecaoId,
      nome: d.nome,
      tipo: d.tipo,
      ordem: itens.length * 100,
      config: d.config,
    };
    aplicar([...itens, novo]);
    setAdicionando(false);
  }

  return (
    <div className="corpo-editor">
      <p className="corpo-editor__aviso">
        Alterar os blocos aqui muda só ESTE registro — os outros continuam como estão.
      </p>

      <div className="corpo-editor__lista">
        {itens.map((campo, i) => {
          if (editando === campo.id) {
            return (
              <div key={campo.id} className="corpo-editor__item corpo-editor__item--editar">
                <FormBloco
                  inicial={{ nome: campo.nome, tipo: campo.tipo, config: campo.config }}
                  textoAcao="Salvar bloco"
                  encadear={false}
                  autoFoco
                  aoSalvar={async (d) => salvarEdicao(campo.id, d)}
                  aoCancelar={() => setEditando(null)}
                />
              </div>
            );
          }
          if (confirmando === campo.id) {
            return (
              <div key={campo.id} className="confirma-inline">
                <span className="confirma-inline__texto">Apagar “{campo.nome}” deste registro?</span>
                <Botao variante="perigo" onClick={() => remover(campo.id)}>
                  Apagar
                </Botao>
                <Botao variante="fantasma" onClick={() => setConfirmando(null)}>
                  Cancelar
                </Botao>
              </div>
            );
          }
          return (
            <div key={campo.id} className="corpo-editor__bloco">
              <div className="corpo-editor__mover">
                <button
                  type="button"
                  className="btn btn--icone seta"
                  aria-label={`Subir ${campo.nome}`}
                  disabled={i === 0 || ocupado}
                  onClick={() => mover(campo.id, 'cima')}
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  type="button"
                  className="btn btn--icone seta"
                  aria-label={`Descer ${campo.nome}`}
                  disabled={i === itens.length - 1 || ocupado}
                  onClick={() => mover(campo.id, 'baixo')}
                >
                  <ChevronDown size={16} />
                </button>
              </div>
              <span className="corpo-editor__icone">
                <IconeTipo tipo={campo.tipo} />
              </span>
              <div className="corpo-editor__corpo">
                <div className="corpo-editor__nome">{campo.nome}</div>
                <div className="etiqueta corpo-editor__sub">{subtitulo(campo)}</div>
              </div>
              <div className="corpo-editor__acoes">
                <button
                  type="button"
                  className="btn btn--icone"
                  aria-label={`Editar ${campo.nome}`}
                  disabled={ocupado}
                  onClick={() => setEditando(campo.id)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  className="btn btn--icone"
                  aria-label={`Apagar ${campo.nome}`}
                  disabled={ocupado}
                  onClick={() => setConfirmando(campo.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {adicionando ? (
        <div className="corpo-editor__item corpo-editor__item--editar">
          <FormBloco
            inicial={{ nome: '', tipo: 'texto', config: {} }}
            textoAcao="Adicionar bloco"
            encadear={false}
            autoFoco
            aoSalvar={async (d) => adicionar(d)}
            aoCancelar={() => setAdicionando(false)}
          />
        </div>
      ) : (
        <Botao variante="padrao" onClick={() => setAdicionando(true)} disabled={ocupado}>
          <ListPlus size={16} />
          Adicionar bloco a este registro
        </Botao>
      )}
    </div>
  );
}
