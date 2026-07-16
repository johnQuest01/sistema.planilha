import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../api/cliente';
import type { Colecao, Registro } from '../../../shared/tipos';
import { FolhaInferior } from '../ui/FolhaInferior';
import { Botao } from '../ui/Botao';
import { CampoValor } from './CampoValor';
import { Grade } from '../imagens/Grade';
import { keysDoCampo, tituloDoRegistro } from './derivarResumo';
import './preencher.css';

interface Props {
  colecao: Colecao;
  registro: Registro;
  aoFechar: () => void;
  aoAtualizar: (r: Registro) => void;
  aoApagar: (id: string) => void;
}

const DEBOUNCE_MS = 400;

export function Ficha({ colecao, registro, aoFechar, aoAtualizar, aoApagar }: Props): JSX.Element {
  const [valores, setValores] = useState<Record<string, unknown>>(registro.valores);
  const valoresRef = useRef<Record<string, unknown>>(registro.valores);
  const sujosRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const montadoRef = useRef(true);
  const [confirmando, setConfirmando] = useState(false);

  // Salva de fato os campos marcados como "sujos" num único PATCH (o backend faz merge).
  const flush = useCallback(async () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const ids = [...sujosRef.current];
    if (ids.length === 0) return;
    sujosRef.current.clear();
    const parcial: Record<string, unknown> = {};
    for (const id of ids) parcial[id] = valoresRef.current[id];
    try {
      const atualizado = await api.editarRegistro(registro.id, parcial);
      valoresRef.current = atualizado.valores;
      // o pai continua montado mesmo quando a ficha fecha: sempre reflete na lista.
      aoAtualizar(atualizado);
      if (montadoRef.current) setValores(atualizado.valores);
    } catch {
      // devolve os ids à fila pra tentar de novo no próximo flush
      for (const id of ids) sujosRef.current.add(id);
    }
  }, [registro.id, aoAtualizar]);

  // Flush garantido ao desmontar (fechar por Esc, clique fora, X ou navegação).
  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
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

  function fechar(): void {
    void flush();
    aoFechar();
  }

  const registroLocal: Registro = { ...registro, valores };

  return (
    <FolhaInferior titulo={tituloDoRegistro(colecao.campos, registroLocal)} onFechar={fechar}>
      <div className="ficha">
        {colecao.campos.map((campo) => (
          <div key={campo.id} className="ficha__bloco">
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

        <div className="ficha__bloco">
          {confirmando ? (
            <div className="confirma-inline">
              <span className="confirma-inline__texto">Apagar este registro?</span>
              <Botao
                variante="perigo"
                onClick={() => {
                  void api.apagarRegistro(registro.id).then(() => aoApagar(registro.id));
                }}
              >
                Apagar
              </Botao>
              <Botao variante="fantasma" onClick={() => setConfirmando(false)}>
                Cancelar
              </Botao>
            </div>
          ) : (
            <Botao variante="perigo" onClick={() => setConfirmando(true)}>
              <Trash2 size={16} />
              Apagar registro
            </Botao>
          )}
        </div>
      </div>
    </FolhaInferior>
  );
}
