import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../api/cliente';
import type { Colecao, Registro } from '../../../shared/tipos';
import { FolhaInferior } from '../ui/FolhaInferior';
import { Botao } from '../ui/Botao';
import { CampoValor } from './CampoValor';
import { SecaoEditor, linhasDe } from './SecaoEditor';
import { Grade } from '../imagens/Grade';
import { keysDoCampo, tituloDoRegistro } from './derivarResumo';
import './preencher.css';

const fmtPreenchido = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

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
  const [confirmando, setConfirmando] = useState(false);

  // aoAtualizar muda de identidade a cada render do pai. Guardamos numa ref para
  // o flush não se recriar (e o efeito de desmontagem não ficar reprocessando).
  const aoAtualizarRef = useRef(aoAtualizar);
  useEffect(() => {
    aoAtualizarRef.current = aoAtualizar;
  }, [aoAtualizar]);

  // Salva os campos "sujos" num único PATCH (o backend faz merge).
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
      // NÃO sobrescrevemos `valores`/`valoresRef` com a resposta: se o usuário digitou
      // durante o request, a resposta está defasada e apagaria/reescreveria o que ele
      // acabou de digitar. O estado local é a fonte da verdade; refletimos no pai com
      // os valores locais mais recentes (que já incluem o que foi digitado em voo).
      aoAtualizarRef.current({ ...atualizado, valores: valoresRef.current });
    } catch {
      // devolve os ids à fila pra tentar de novo no próximo flush
      for (const id of ids) sujosRef.current.add(id);
    }
  }, [registro.id]);

  // Flush garantido ao desmontar (fechar por Esc, clique fora, X ou navegação).
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

  function fechar(): void {
    void flush();
    aoFechar();
  }

  const registroLocal: Registro = { ...registro, valores };

  return (
    <FolhaInferior
      titulo={tituloDoRegistro(colecao.campos, registroLocal)}
      subtitulo={`Preenchido em ${fmtPreenchido.format(new Date(registro.atualizadoEm))}`}
      onFechar={fechar}
    >
      <div className="ficha">
        {colecao.campos.map((campo) => (
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
