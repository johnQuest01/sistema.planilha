import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { api } from '../api/cliente';
import type { Colecao, Registro } from '../../../shared/tipos';
import { CampoValor } from '../preencher/CampoValor';
import { SecaoEditor, linhasDe } from '../preencher/SecaoEditor';
import { Grade } from '../imagens/Grade';
import { camposDoRegistro, keysDoCampo } from '../preencher/derivarResumo';

export interface ParteEditorHandle {
  flush: () => Promise<void>;
  valores: () => Record<string, unknown>;
}

interface Props {
  colecao: Colecao;
  registro: Registro;
  aoAtualizar: (r: Registro) => void;
  aoSalvando: (salvando: boolean) => void;
}

const DEBOUNCE_MS = 400;

// Edita os blocos de UM registro (uma parte da integração), roteando cada PATCH
// para o registro correto. Reusa exatamente os mesmos editores de campo da Ficha,
// então imagem/seção/valores funcionam igual. O pai chama `flush()` para "salvar
// tudo de uma vez" ou ao fechar.
export const ParteEditor = forwardRef<ParteEditorHandle, Props>(function ParteEditor(
  { colecao, registro, aoAtualizar, aoSalvando },
  ref,
): JSX.Element {
  const [valores, setValores] = useState<Record<string, unknown>>(registro.valores);
  const valoresRef = useRef<Record<string, unknown>>(registro.valores);
  const sujosRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aoAtualizarRef = useRef(aoAtualizar);
  const aoSalvandoRef = useRef(aoSalvando);

  useEffect(() => {
    aoAtualizarRef.current = aoAtualizar;
    aoSalvandoRef.current = aoSalvando;
  });

  useEffect(() => {
    setValores(registro.valores);
    valoresRef.current = registro.valores;
    sujosRef.current.clear();
  }, [registro.id]);

  const corpo = camposDoRegistro(colecao, registro);

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const ids = [...sujosRef.current];
    if (ids.length === 0) return;
    sujosRef.current.clear();
    const parcial: Record<string, unknown> = {};
    for (const id of ids) parcial[id] = valoresRef.current[id];
    aoSalvandoRef.current(true);
    try {
      const atualizado = await api.editarRegistro(registro.id, parcial);
      aoAtualizarRef.current({ ...atualizado, valores: valoresRef.current });
    } catch {
      for (const id of ids) sujosRef.current.add(id);
    } finally {
      aoSalvandoRef.current(false);
    }
  }, [registro.id]);

  useImperativeHandle(ref, () => ({ flush, valores: () => valoresRef.current }), [flush]);

  // Flush garantido ao desmontar (fechar a folha, trocar de registro).
  useEffect(() => {
    return () => {
      void flush();
    };
  }, [flush]);

  function marcar(id: string, v: unknown): void {
    const novo = { ...valoresRef.current, [id]: v };
    valoresRef.current = novo;
    setValores(novo);
    sujosRef.current.add(id);
  }

  function agendarFlush(): void {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), DEBOUNCE_MS);
  }

  const registroLocal: Registro = { ...registro, valores };

  return (
    <>
      {corpo.map((campo) => (
        <div key={campo.id} className="ficha__bloco">
          {campo.config.titulo !== undefined && campo.config.titulo !== '' && (
            <h3 className="bloco-titulo">{campo.config.titulo}</h3>
          )}
          <span className="ficha__rotulo">
            {campo.nome}
            {campo.config.obrigatorio === true ? ' *' : ''}
          </span>
          {campo.tipo === 'imagem' ? (
            <Grade
              registroId={registro.id}
              campo={campo}
              keys={keysDoCampo(registroLocal, campo.id)}
              aoMudar={(keys) => {
                marcar(campo.id, keys);
                void flush();
              }}
            />
          ) : campo.tipo === 'secao' ? (
            <SecaoEditor
              campo={campo}
              registroId={registro.id}
              linhas={linhasDe(valores[campo.id])}
              aoMudar={(linhas) => {
                marcar(campo.id, linhas);
                agendarFlush();
              }}
            />
          ) : (
            <CampoValor
              campo={campo}
              valor={valores[campo.id]}
              aoMudar={(v) => {
                marcar(campo.id, v);
                agendarFlush();
              }}
              aoSairFoco={() => void flush()}
            />
          )}
        </div>
      ))}
    </>
  );
});
